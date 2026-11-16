"""Bounded Responses adaptation for the explicit official OpenAI local profile."""

import asyncio
import hashlib
import json
import logging

from .errors import AiDomainError
from .mcp_gateway import _McpResponseTooLarge, _exception_tree_contains, _exception_tree_is_timeout
from .model_proxy import (
    INPUT_INVALID, RESPONSE_INVALID, STRUCTURED_MODEL_LIMITS, TOOLS, _close,
    _decode_json, _invalid, _json_bytes, _object, _payload, _text, response_to_messages,
)
from .providers import OpenAiCompatibleProvider, ProviderConfig
from .model_input import MODEL_INPUT_LIMITS, ModelInputMetadata, _PreparedInputs

MODEL = 'gpt-6.1-sol'
LOGGER = logging.getLogger(__name__)


def _diagnose(error, stage, status, category=None):
    line, traceback = 0, error.__traceback__
    while traceback is not None:
        if traceback.tb_frame.f_code.co_filename == __file__:
            line = traceback.tb_lineno
        traceback = traceback.tb_next
    known = {'AGENT_MODEL_FAILED', 'AGENT_MODEL_TIMEOUT', 'AGENT_MODEL_RESPONSE_TOO_LARGE',
             INPUT_INVALID, RESPONSE_INVALID}
    if category not in known:
        category = str(error) if type(error) in (RuntimeError, ValueError) and str(error) in known else 'AGENT_MODEL_FAILED'
    try:
        LOGGER.warning('OpenAI local request failed stage=%s status=%s category=%s line=%d',
                       stage, status, category, line)
    except Exception:
        pass  # A diagnostic sink cannot replace the original failure.


def responses_payload(body):
    converted = _payload(body, MODEL)
    inputs = []
    for row in converted['messages']:
        role = row['role']
        if role == 'tool':
            inputs.append({'type': 'function_call_output', 'call_id': row['tool_call_id'],
                           'output': row['content']})
        elif role == 'assistant':
            # The SDK cannot round-trip Responses message.phase. Intermediate
            # prose is never returned to it, so accepting it back would invent
            # phase/history. Function calls have their own protocol items.
            if row.get('content'):
                _invalid(INPUT_INVALID)
            for call in row.get('tool_calls', []):
                inputs.append({'type': 'function_call', 'call_id': call['id'],
                    'name': call['function']['name'], 'arguments': call['function']['arguments']})
        else:
            inputs.append({'role': role, 'content': row['content']})
    if converted.get('temperature') != 0 or converted.get('top_p', 1) != 1:
        _invalid(INPUT_INVALID)
    choice = converted.get('tool_choice', 'auto')
    if isinstance(choice, dict):
        choice = {'type': 'function', 'name': choice['function']['name']}
    return {'model': MODEL, 'input': inputs, 'tools': [
        {'type': 'function', 'name': item['function']['name'],
         'description': item['function']['description'],
         'parameters': item['function']['parameters'], 'strict': False}
        for item in converted['tools']], 'tool_choice': choice, 'parallel_tool_calls': False,
        'max_output_tokens': converted['max_tokens'], 'reasoning': {'effort': 'low'},
        'store': False, 'stream': False, 'truncation': 'disabled'}


def responses_result(body):
    if (type(body) is not dict or body.get('object') != 'response' or body.get('model') != MODEL
            or body.get('status') not in ('completed', 'incomplete')
            or body.get('error') is not None or type(body.get('output')) is not list):
        _invalid(RESPONSE_INVALID)
    incomplete = body.get('incomplete_details')
    if body['status'] == 'incomplete':
        _object(incomplete, ('reason',), code=RESPONSE_INVALID)
        if incomplete['reason'] != 'max_output_tokens':
            _invalid(RESPONSE_INVALID)
    elif incomplete is not None:
        _invalid(RESPONSE_INVALID)
    usage = body.get('usage')
    if type(usage) is not dict:
        _invalid(RESPONSE_INVALID)
    texts, calls = [], []
    for item in body['output']:
        if type(item) is not dict:
            _invalid(RESPONSE_INVALID)
        kind = item.get('type')
        if kind == 'reasoning':
            # Deliberately no plaintext, encrypted continuation, or summary
            # is returned to the SDK, persisted, or interpreted as authority.
            continue
        if kind == 'function_call':
            _object(item, ('type', 'call_id', 'name', 'arguments', 'status'), ('id',), code=RESPONSE_INVALID)
            if item.get('status') != 'completed' or item.get('name') not in TOOLS:
                _invalid(RESPONSE_INVALID)
            calls.append({'id': item.get('call_id'), 'type': 'function', 'function': {
                'name': item.get('name'), 'arguments': item.get('arguments')}})
        elif kind == 'message':
            _object(item, ('type', 'role', 'status', 'content'), ('id', 'phase'), code=RESPONSE_INVALID)
            if (item.get('role') != 'assistant' or item.get('status') != 'completed'
                    or item.get('phase') not in (None, 'commentary', 'final_answer')
                    or type(item.get('content')) is not list):
                _invalid(RESPONSE_INVALID)
            for content in item['content']:
                _object(content, ('type', 'text'), ('annotations', 'logprobs'), code=RESPONSE_INVALID)
                if (content['type'] != 'output_text'
                        or any(content.get(key) is not None and
                            (type(content[key]) is not list or content[key])
                            for key in ('annotations', 'logprobs') if key in content)):
                    _invalid(RESPONSE_INVALID)
                text = _text(content['text'], code=RESPONSE_INVALID)
                if item.get('phase') != 'commentary':
                    texts.append(text)
        else:
            _invalid(RESPONSE_INVALID)
    # An incomplete function call is never executed. No intermediate prose is
    # forwarded on tool turns because the SDK does not preserve its phase.
    reason = ('length' if body['status'] == 'incomplete' else 'tool_calls' if calls else 'stop')
    if calls and reason == 'length':
        _invalid(RESPONSE_INVALID)
    value = {'id': body.get('id'), 'model': MODEL, 'choices': [{'index': 0,
        'finish_reason': reason, 'message': {'role': 'assistant',
            'content': None if calls else '\n'.join(texts), 'tool_calls': calls}}],
        'usage': {'prompt_tokens': usage.get('input_tokens'),
                  'completion_tokens': usage.get('output_tokens'), 'total_tokens': usage.get('total_tokens')}}
    return response_to_messages(value, MODEL)


class OpenAiResponsesProxy:
    def __init__(self, config, *, provider_factory=OpenAiCompatibleProvider):
        if (not isinstance(config, ProviderConfig) or config.provider != 'openai-local'
                or config.model != MODEL or config.base_url != 'https://api.openai.com/v1'
                or config.auth_mode != 'bearer' or not callable(provider_factory)):
            _invalid(INPUT_INVALID)
        # Reuse the strict credential checks without constructing a client.
        from .model_proxy import StructuredModelProxy
        StructuredModelProxy(config)
        self.config, self._factory = config, provider_factory
        self._prepared = _PreparedInputs(self)
        self.model_label = MODEL + '（OpenAI 官方 API）'

    @property
    def limits(self):
        return STRUCTURED_MODEL_LIMITS

    async def __call__(self, body):
        try:
            async with asyncio.timeout(self.limits.total_timeout_seconds):
                return await self.generate(await self.prepare(body))
        except TimeoutError as error:
            _diagnose(error, 'total', None, 'AGENT_MODEL_TIMEOUT')
            raise RuntimeError('AGENT_MODEL_TIMEOUT') from None

    def input_metadata(self, handle) -> ModelInputMetadata:
        return self._prepared.metadata(self, handle)

    async def prepare(self, body):
        self._prepared.check(self)
        payload = responses_payload(body)
        def canonical(value):
            _json_bytes(value, self.limits.max_request_bytes, INPUT_INVALID)
            return json.dumps(value, ensure_ascii=False, allow_nan=False,
                              separators=(',', ':'), sort_keys=True).encode('utf-8')
        raw = canonical(payload)
        count_raw = canonical({key: value for key, value in payload.items()
                               if key not in ('max_output_tokens', 'store', 'stream')})
        value = await self._post(count_raw, counting=True)
        try:
            _object(value, ('object', 'input_tokens'), code=RESPONSE_INVALID)
            if (value['object'] != 'response.input_tokens' or type(value['input_tokens']) is not int
                    or not 1 <= value['input_tokens'] <= 2147483647):
                _invalid(RESPONSE_INVALID)
        except ValueError as error:
            _diagnose(error, 'count_adapt', 200)
            raise
        metadata = ModelInputMetadata(value['input_tokens'], hashlib.sha256(raw).hexdigest(),
                                      hashlib.sha256(count_raw).hexdigest())
        # _post has already drained close; a failed/cancelled close never issues.
        return self._prepared.issue(self, metadata, raw)

    async def generate(self, handle):
        state = self._prepared.consume(self, handle)  # Atomic and before any await/DNS.
        payload = json.loads(state.wire)  # Read controls; never rebuild generation wire.
        value = await self._post(state.wire, counting=False)
        stage = 'adapt'
        try:
            result = responses_result(value)
            stage = 'controls'
            if (result['usage']['input_tokens'] != state.metadata.input_tokens
                    or result['usage']['output_tokens'] > payload['max_output_tokens']):
                _invalid(RESPONSE_INVALID)
            calls = [item for item in result['content'] if item['type'] == 'tool_use']
            choice = payload['tool_choice']
            if (len(calls) > 1 or choice == 'none' and calls
                    or isinstance(choice, dict) and (len(calls) != 1 or calls[0]['name'] != choice['name'])
                    or choice == 'required' and not calls):
                _invalid(RESPONSE_INVALID)
            previous = {item['call_id'] for item in payload['input'] if item.get('type') == 'function_call'}
            if any(item['type'] == 'tool_use' and item['id'] in previous for item in result['content']):
                _invalid(RESPONSE_INVALID)
            return result
        except ValueError as error:
            _diagnose(error, stage, 200)
            raise

    async def _post(self, raw, *, counting):
        seconds = MODEL_INPUT_LIMITS.count_timeout_seconds if counting else self.limits.total_timeout_seconds
        response_limit = MODEL_INPUT_LIMITS.max_count_response_bytes if counting else self.limits.max_response_bytes
        path = '/v1/responses/input_tokens' if counting else '/v1/responses'
        prefix = 'count_' if counting else ''
        client, dependencies, succeeded = None, None, False
        stage, status = prefix + 'connect', None
        try:
            async with asyncio.timeout(seconds):
                provider = self._factory(self.config, total_timeout_seconds=seconds, read_timeout_seconds=seconds,
                    max_output_tokens=1024, max_stream_bytes=response_limit)
                if not isinstance(provider, OpenAiCompatibleProvider):
                    raise RuntimeError('AGENT_MODEL_FAILED')
                options = await provider._connection_options('https://api.openai.com' + path)
                dependencies = provider._load_dependencies()
                client = provider._build_http_client(dependencies, options)
                await client.__aenter__()
                stage = prefix + 'request'
                response = await client.post(options.endpoint, content=raw,
                                             headers={'Content-Type': 'application/json'})
                status = response.status_code
                if response.status_code != 200:
                    raise RuntimeError('AGENT_MODEL_FAILED')
                stage = prefix + 'decode'
                value = _decode_json(response.content, response_limit, RESPONSE_INVALID)
                succeeded = True
                return value
        except asyncio.CancelledError:
            raise
        except ValueError as error:
            _diagnose(error, stage, status)
            if str(error) == RESPONSE_INVALID:
                _invalid(RESPONSE_INVALID)
            raise RuntimeError('AGENT_MODEL_FAILED') from None
        except Exception as error:
            timeout = getattr(getattr(dependencies, 'httpx2', None), 'TimeoutException', None)
            if _exception_tree_contains(error, _McpResponseTooLarge):
                code = 'AGENT_MODEL_RESPONSE_TOO_LARGE'
            elif (isinstance(error, AiDomainError) and error.code == 'AI_PROVIDER_TIMEOUT'
                    or _exception_tree_is_timeout(error, timeout)):
                code = 'AGENT_MODEL_TIMEOUT'
            else:
                code = 'AGENT_MODEL_FAILED'
            _diagnose(error, stage, status, code)
            raise RuntimeError(code) from None
        finally:
            if client is not None:
                try:
                    await _close(client)
                except asyncio.CancelledError:
                    raise
                except Exception:
                    if asyncio.current_task().cancelling():
                        raise asyncio.CancelledError from None
                    if succeeded:
                        raise RuntimeError('AGENT_MODEL_FAILED') from None
