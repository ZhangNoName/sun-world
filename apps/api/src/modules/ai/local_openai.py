"""Official OpenAI transport for local validation and fixed guest chat."""

from dataclasses import replace
import json
import os
from pathlib import Path
import stat
from types import SimpleNamespace

from src.core.runtime_env import is_local_runtime
from .errors import AiDomainError
from .model_proxy import _invalid
from .openai_responses import MODEL, OpenAiResponsesProxy
from .providers import (
    GUEST_OPENAI_MODEL, MAX_REASONING_SUMMARY_CHARACTERS, OPENAI_API_BASE_URL,
    OpenAiCompatibleProvider, ProviderConfig, ReasoningSummaryPart,
)

INVALID = 'AGENT_OPENAI_CONFIG_INVALID'
DEFAULT_KEY_FILE = Path(__file__).resolve().parents[5] / '.tmp/openai-local/api-key'


def read_key(path):
    descriptor = None
    try:
        if not Path(path).is_absolute():
            _invalid(INVALID)
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600
                or info.st_uid != os.getuid() or info.st_nlink != 1 or not 24 <= info.st_size <= 512):
            _invalid(INVALID)
        raw = os.read(descriptor, 513)
        key = raw.decode('ascii')
        if (len(raw) != info.st_size or len(raw) > 512 or not key.startswith('sk-')
                or any(not (character.isalnum() or character in '_-') for character in key)):
            _invalid(INVALID)
        return key
    except Exception:
        _invalid(INVALID)
    finally:
        if descriptor is not None:
            os.close(descriptor)


def _official_provider_factory(proxy_url, provider_class=OpenAiCompatibleProvider):
    from .local_openai_transport import OfficialOpenAiDnsResolver, create_loopback_transport, validate_proxy
    if proxy_url is not None:
        proxy_url = validate_proxy(proxy_url)
    resolver = OfficialOpenAiDnsResolver(proxy_url) if proxy_url else None

    class OfficialProvider(provider_class):
        def _load_dependencies(self):
            import httpx
            dependencies = super()._load_dependencies()
            module = SimpleNamespace(AsyncClient=httpx.AsyncClient, AsyncByteStream=httpx.AsyncByteStream,
                Timeout=httpx.Timeout, TimeoutException=httpx.TimeoutException)
            return replace(dependencies, httpx2=module)

        def _build_http_client(self, dependencies, options):
            original = dependencies.httpx2
            transport = create_loopback_transport(options, proxy_url) if proxy_url else None
            def client(**settings):
                return original.AsyncClient(**settings, **({'transport': transport} if transport else {}))
            module = SimpleNamespace(AsyncClient=client, AsyncByteStream=original.AsyncByteStream,
                Timeout=original.Timeout, TimeoutException=original.TimeoutException)
            return super()._build_http_client(replace(dependencies, httpx2=module), options)

    def factory(selected, **limits):
        return OfficialProvider(selected, allowed_hosts=('api.openai.com',),
            resolver=resolver, **limits)
    return factory


def create_local_openai_proxy(*, key_file=None, proxy_url=None):
    if not is_local_runtime():
        _invalid(INVALID)
    proxy_url = proxy_url if proxy_url is not None else os.getenv('DSH_OPENAI_PROXY_URL') or None
    factory = _official_provider_factory(proxy_url)
    key_file = key_file or os.getenv('DSH_OPENAI_API_KEY_FILE') or DEFAULT_KEY_FILE
    config = ProviderConfig(provider='openai-local', model=MODEL, base_url=OPENAI_API_BASE_URL,
                            auth_mode='bearer', api_key=read_key(key_file))
    return OpenAiResponsesProxy(config, provider_factory=factory)


class GuestOpenAiProvider(OpenAiCompatibleProvider):
    _require_done = True

    def __init__(self, config, *, reasoning_effort='medium', **limits):
        super().__init__(config, **limits)
        self._reasoning_effort = reasoning_effort

    def _endpoint(self):
        return f'{OPENAI_API_BASE_URL}/responses'

    def _stream_payload(self, messages):
        return {
            'model': GUEST_OPENAI_MODEL,
            'input': messages,
            'stream': True,
            'max_output_tokens': self._max_output_tokens,
            'reasoning': {'effort': self._reasoning_effort, 'summary': 'concise'},
            'store': False,
        }

    def _stream_event(self, raw):
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            return False, None
        if not isinstance(event, dict):
            return False, None
        kind = event.get('type')
        if kind in ('response.output_text.delta', 'response.refusal.delta'):
            delta = event.get('delta')
            return False, delta if isinstance(delta, str) else None
        if kind == 'response.reasoning_summary_part.done':
            part = event.get('part')
            text = _summary_part_text(part)
            return False, ReasoningSummaryPart(text) if text else None
        if kind == 'response.completed':
            response = event.get('response')
            if isinstance(response, dict) and response.get('status') == 'completed':
                self._record_usage(response.get('usage'), 'input_tokens', 'output_tokens')
                self.reasoning_summary = _response_reasoning_summary(response.get('output'))
                return True, None
        if kind in ('error', 'response.failed', 'response.incomplete', 'response.completed'):
            raise AiDomainError(
                'AI_PROVIDER_PROTOCOL_ERROR', 'AI 回复未完整生成，请重试。', status_code=502,
            )
        return False, None


def _summary_part_text(part) -> str:
    if not isinstance(part, dict) or part.get('type') != 'summary_text':
        return ''
    text = part.get('text')
    return text[:MAX_REASONING_SUMMARY_CHARACTERS].strip() if isinstance(text, str) else ''


def _response_reasoning_summary(output) -> str | None:
    if not isinstance(output, list):
        return None
    parts = [
        text
        for item in output
        if isinstance(item, dict) and item.get('type') == 'reasoning'
        and isinstance(item.get('summary'), list)
        for part in item['summary']
        if (text := _summary_part_text(part))
    ]
    return '\n\n'.join(parts)[:MAX_REASONING_SUMMARY_CHARACTERS] or None


def create_guest_openai_provider_factory():
    key_file = os.getenv('AI_GUEST_OPENAI_API_KEY_FILE')
    key = os.getenv('AI_GUEST_OPENAI_API_KEY')
    if not key and not key_file:
        return None
    if key and key_file:
        raise ValueError('Configure one guest OpenAI credential source.')
    if key_file:
        key = read_key(key_file)
    if (not isinstance(key, str) or not key.isascii() or not key.startswith('sk-')
            or not 24 <= len(key) <= 512
            or any(not (character.isalnum() or character in '_-') for character in key)):
        raise ValueError('Guest OpenAI credential is invalid.')
    proxy_url = os.getenv('AI_GUEST_OPENAI_PROXY_URL') or None
    if proxy_url is not None and not is_local_runtime():
        raise ValueError('Guest OpenAI proxy is only supported in local development.')
    factory = _official_provider_factory(proxy_url, GuestOpenAiProvider)
    config = ProviderConfig('openai', GUEST_OPENAI_MODEL, OPENAI_API_BASE_URL, api_key=key)

    def create(reasoning_effort):
        return factory(
            config,
            reasoning_effort=reasoning_effort,
            max_output_tokens=2048,
            total_timeout_seconds=120,
            read_timeout_seconds=75,
        )

    return create
