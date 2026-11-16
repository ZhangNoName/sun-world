"""Explicit development credentials and fixed official OpenAI transport profile."""

from dataclasses import replace
import os
from pathlib import Path
import stat
from types import SimpleNamespace

from src.core.runtime_env import is_local_runtime
from .model_proxy import _invalid
from .openai_responses import MODEL, OpenAiResponsesProxy
from .providers import OpenAiCompatibleProvider, ProviderConfig

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


def create_local_openai_proxy(*, key_file=None, proxy_url=None):
    if not is_local_runtime():
        _invalid(INVALID)
    from .local_openai_transport import OfficialOpenAiDnsResolver, create_loopback_transport, validate_proxy
    proxy_url = proxy_url if proxy_url is not None else os.getenv('DSH_OPENAI_PROXY_URL') or None
    if proxy_url is not None:
        proxy_url = validate_proxy(proxy_url)
    key_file = key_file or os.getenv('DSH_OPENAI_API_KEY_FILE') or DEFAULT_KEY_FILE
    config = ProviderConfig(provider='openai-local', model=MODEL, base_url='https://api.openai.com/v1',
                            auth_mode='bearer', api_key=read_key(key_file))
    resolver = OfficialOpenAiDnsResolver(proxy_url) if proxy_url else None

    class OfficialProvider(OpenAiCompatibleProvider):
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
    return OpenAiResponsesProxy(config, provider_factory=factory)
