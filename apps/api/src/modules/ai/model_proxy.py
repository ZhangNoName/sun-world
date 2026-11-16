"""Strict structured Messages adaptation; ordinary text providers stay separate."""

import asyncio
import json
import math
import re
from dataclasses import dataclass

import anyio

from .errors import AiDomainError
from .mcp_gateway import _McpResponseTooLarge, _exception_tree_contains, _exception_tree_is_timeout
from .providers import OpenAiCompatibleProvider, ProviderConfig


@dataclass(frozen=True, slots=True)
class StructuredModelLimits:
    max_output_tokens: int = 1024
    max_request_bytes: int = 128 * 1024
    max_response_bytes: int = 64 * 1024
    total_timeout_seconds: int = 30


STRUCTURED_MODEL_LIMITS = StructuredModelLimits()
TOOLS = frozenset({'blog_search_public', 'blog_read_public'})
INPUT_INVALID = 'AGENT_MODEL_INPUT_INVALID'
RESPONSE_INVALID = 'AGENT_MODEL_RESPONSE_INVALID'
IDENTIFIER = re.compile(r'[A-Za-z0-9_-]{1,128}\Z', re.ASCII)
BODY_KEYS = frozenset({'model', 'system', 'messages', 'tools', 'max_tokens', 'stream',
                       'temperature', 'top_p', 'tool_choice', 'thinking'})


def _invalid(code):
    raise ValueError(code) from None


def _object(value, required, optional=(), *, code=INPUT_INVALID):
    if (type(value) is not dict or not set(required) <= value.keys()
            or set(value) - set(required) - set(optional)):
        _invalid(code)


def _text(value, *, code=INPUT_INVALID, empty=True):
    if not isinstance(value, str) or (not empty and not value):
        _invalid(code)
    try:
        value.encode('utf-8')
    except UnicodeError:
        _invalid(code)
    return value


def _model_text(value, code):
    value = _text(value, code=code, empty=False)
    if not value.strip() or len(value) > 160 or re.search(r'[\x00-\x1f\x7f]', value):
        _invalid(code)
    return value


def _json_bytes(value, limit, code):
    remaining = 8192
    def visit(item, depth):
        nonlocal remaining
        remaining -= 1
        if remaining < 0 or depth > 32:
            _invalid(code)
        if item is None or type(item) in (bool, int):
            return
        if isinstance(item, str):
            _text(item, code=code)
        elif type(item) is float:
            if not math.isfinite(item):
                _invalid(code)
        elif type(item) is list:
            for child in item:
                visit(child, depth + 1)
        elif type(item) is dict:
            for key, child in item.items():
                _text(key, code=code)
                visit(child, depth + 1)
        else:
            _invalid(code)
    try:
        visit(value, 0)
        raw = json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode('utf-8')
        if len(raw) > limit:
            _invalid(code)
        return raw
    except Exception:
        _invalid(code)


def _decode_json(raw, limit, code):
    def pairs(items):
        value = {}
        for key, item in items:
            if key in value:
                _invalid(code)
            value[key] = item
        return value
    try:
        if not isinstance(raw, (bytes, str)):
            _invalid(code)
        encoded = raw.encode('utf-8') if isinstance(raw, str) else raw
        if len(encoded) > limit:
            _invalid(code)
        value = json.loads(encoded.decode('utf-8'), object_pairs_hook=pairs,
                           parse_constant=lambda _: _invalid(code))
        _json_bytes(value, limit, code)
        return value
    except Exception:
        _invalid(code)


def _identifier(value, code):
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        _invalid(code)
    return value


def _texts(value, *, code=INPUT_INVALID):
    if isinstance(value, str):
        return _text(value, code=code)
    if type(value) is not list or len(value) > 64:
        _invalid(code)
    result = []
    for block in value:
        _object(block, ('type', 'text'), code=code)
        if block['type'] != 'text':
            _invalid(code)
        result.append(_text(block['text'], code=code))
    return '\n'.join(result)


def messages_to_openai(body: dict) -> list[dict]:
    _object(body, ('messages',), BODY_KEYS - {'messages'})
    _json_bytes(body, STRUCTURED_MODEL_LIMITS.max_request_bytes, INPUT_INVALID)
    if 'thinking' in body:
        _object(body['thinking'], ('type',))
        if body['thinking']['type'] != 'disabled':
            _invalid(INPUT_INVALID)
    # Only the SDK's disabled control is supported. It is not an OpenAI/Qwen
    # parameter and does not claim the upstream model performs no reasoning.
    history = body['messages']
    if type(history) is not list or not 1 <= len(history) <= 256:
        _invalid(INPUT_INVALID)
    messages, pending, used = [], set(), set()
    system = _texts(body.get('system', []))
    if system:
        messages.append({'role': 'system', 'content': system})
    for message in history:
        _object(message, ('role', 'content'))
        role, content = message['role'], message['content']
        if role not in ('user', 'assistant'):
            _invalid(INPUT_INVALID)
        if isinstance(content, str):
            if pending:
                _invalid(INPUT_INVALID)
            messages.append({'role': role, 'content': _text(content, empty=False)})
            continue
        if type(content) is not list or not 1 <= len(content) <= 64:
            _invalid(INPUT_INVALID)
        if role == 'assistant' and pending:
            _invalid(INPUT_INVALID)
        text, calls, saw_text = [], [], False
        for block in content:
            if type(block) is not dict:
                _invalid(INPUT_INVALID)
            kind = block.get('type')
            if kind == 'text':
                _object(block, ('type', 'text'))
                if pending:
                    _invalid(INPUT_INVALID)
                text.append(_text(block['text']))
                saw_text = True
            elif kind == 'tool_use' and role == 'assistant':
                _object(block, ('type', 'id', 'name', 'input'))
                identity = _identifier(block['id'], INPUT_INVALID)
                if (identity in used or not isinstance(block['name'], str) or block['name'] not in TOOLS
                        or type(block['input']) is not dict or len(calls) >= 4):
                    _invalid(INPUT_INVALID)
                used.add(identity)
                calls.append({'id': identity, 'type': 'function', 'function': {
                    'name': block['name'], 'arguments': _json_bytes(block['input'], 16384, INPUT_INVALID).decode()}})
            elif kind == 'tool_result' and role == 'user':
                _object(block, ('type', 'tool_use_id', 'content'), ('is_error',))
                identity = _identifier(block['tool_use_id'], INPUT_INVALID)
                if identity not in pending or saw_text or type(block.get('is_error', False)) is not bool:
                    _invalid(INPUT_INVALID)
                pending.remove(identity)
                value = _texts(block['content'])
                if block.get('is_error'):
                    value = json.dumps({'is_error': True, 'content': value}, ensure_ascii=False)
                messages.append({'role': 'tool', 'tool_call_id': identity, 'content': value})
            else:
                _invalid(INPUT_INVALID)
        if text or calls:
            if not calls and not any(text):
                _invalid(INPUT_INVALID)
            row = {'role': role, 'content': '\n'.join(text) if text else None}
            if calls:
                row['tool_calls'] = calls
                pending.update(call['id'] for call in calls)
            messages.append(row)
    if pending:
        _invalid(INPUT_INVALID)
    return messages


def _usage(value):
    if type(value) is not dict:
        _invalid(RESPONSE_INVALID)
    counters = [value.get('prompt_tokens'), value.get('completion_tokens')]
    if any(type(item) is not int or not 0 <= item <= 2_147_483_647 for item in counters):
        _invalid(RESPONSE_INVALID)
    total = sum(counters)
    if (counters[1] > STRUCTURED_MODEL_LIMITS.max_output_tokens or total > 2_147_483_647
            or ('total_tokens' in value and (type(value['total_tokens']) is not int or value['total_tokens'] != total))):
        _invalid(RESPONSE_INVALID)
    return {'input_tokens': counters[0], 'output_tokens': counters[1]}


def response_to_messages(body: dict, model: str = 'qwen38_27b') -> dict:
    _model_text(model, RESPONSE_INVALID)
    _json_bytes(body, STRUCTURED_MODEL_LIMITS.max_response_bytes, RESPONSE_INVALID)
    if (type(body) is not dict or type(body.get('choices')) is not list or len(body['choices']) != 1
            or body.get('model') != model):
        _invalid(RESPONSE_INVALID)
    identity = _identifier(body.get('id'), RESPONSE_INVALID)
    choice = body['choices'][0]
    if (type(choice) is not dict or type(choice.get('index')) is not int or choice['index'] != 0
            or choice.get('finish_reason') not in ('stop', 'tool_calls', 'length')):
        _invalid(RESPONSE_INVALID)
    message, reason = choice.get('message'), choice['finish_reason']
    _object(message, ('role',), ('content', 'tool_calls', 'refusal', 'annotations', 'audio',
                                'function_call', 'reasoning', 'reasoning_content'), code=RESPONSE_INVALID)
    if message['role'] != 'assistant' or message.get('refusal') is not None:
        _invalid(RESPONSE_INVALID)
    annotations = message.get('annotations')
    if (annotations is not None and (type(annotations) is not list or annotations)
            or message.get('audio') is not None or message.get('function_call') is not None):
        _invalid(RESPONSE_INVALID)
    # Tested OpenAI-compatible neutral metadata only, not a DeepSeek thinking
    # continuation protocol. Neither reasoning spelling is SDK text/authority.
    reasoning, reasoning_content = message.get('reasoning'), message.get('reasoning_content')
    for private in (reasoning, reasoning_content):
        if private is not None:
            _text(private, code=RESPONSE_INVALID)
    if reasoning and reasoning_content and reasoning != reasoning_content:
        _invalid(RESPONSE_INVALID)
    text, calls = message.get('content'), message.get('tool_calls')
    if text is not None:
        _text(text, code=RESPONSE_INVALID)
    if calls is None:
        calls = []
    if (type(calls) is not list or len(calls) > 4
            or ((reason == 'tool_calls') != bool(calls) and reason != 'length')):
        _invalid(RESPONSE_INVALID)
    blocks = [{'type': 'text', 'text': text}] if text else []
    seen = set()
    for call in calls:
        _object(call, ('id', 'type', 'function'), code=RESPONSE_INVALID)
        _object(call['function'], ('name', 'arguments'), code=RESPONSE_INVALID)
        call_id = _identifier(call['id'], RESPONSE_INVALID)
        name, raw_arguments = call['function']['name'], call['function']['arguments']
        if (call_id in seen or call['type'] != 'function' or not isinstance(name, str) or name not in TOOLS
                or not isinstance(raw_arguments, str)):
            _invalid(RESPONSE_INVALID)
        seen.add(call_id)
        arguments = _decode_json(raw_arguments, 16384, RESPONSE_INVALID)
        if type(arguments) is not dict:
            _invalid(RESPONSE_INVALID)
        blocks.append({'type': 'tool_use', 'id': call_id, 'name': name, 'input': arguments})
    if not blocks and reason != 'length':
        _invalid(RESPONSE_INVALID)
    return {'id': identity, 'type': 'message', 'role': 'assistant', 'model': model,
        'content': blocks, 'stop_reason': {'stop': 'end_turn', 'tool_calls': 'tool_use', 'length': 'max_tokens'}[reason],
        'stop_sequence': None, 'usage': _usage(body.get('usage'))}


def _payload(body, model):
    messages = messages_to_openai(body)
    tools = body.get('tools')
    if type(tools) is not list or len(tools) != 2:
        _invalid(INPUT_INVALID)
    names, converted = set(), []
    for tool in tools:
        _object(tool, ('name', 'input_schema'), ('description',))
        name, schema = tool['name'], tool['input_schema']
        if (not isinstance(name, str) or name not in TOOLS or name in names
                or type(schema) is not dict or schema.get('type') != 'object'
                or type(schema.get('properties')) is not dict):
            _invalid(INPUT_INVALID)
        names.add(name)
        converted.append({'type': 'function', 'function': {'name': name,
            'description': _text(tool.get('description', '')), 'parameters': schema}})
    tokens = body.get('max_tokens', STRUCTURED_MODEL_LIMITS.max_output_tokens)
    if type(tokens) is not int or not 1 <= tokens <= STRUCTURED_MODEL_LIMITS.max_output_tokens:
        _invalid(INPUT_INVALID)
    if 'model' in body:
        _model_text(body['model'], INPUT_INVALID)
    if 'stream' in body and type(body['stream']) is not bool:
        _invalid(INPUT_INVALID)
    result = {'model': model, 'messages': messages, 'stream': False,
              'max_tokens': tokens, 'temperature': body.get('temperature', 0), 'tools': converted}
    for field, maximum in (('temperature', 2), ('top_p', 1)):
        value = body.get(field, 0)
        if type(value) not in (int, float) or not 0 <= value <= maximum or not math.isfinite(value):
            _invalid(INPUT_INVALID)
        if field in body:
            result[field] = value
    if 'tool_choice' in body:
        choice = body['tool_choice']
        _object(choice, ('type',), ('name', 'disable_parallel_tool_use'))
        kind = choice['type']
        if (kind not in ('auto', 'any', 'none', 'tool') or ('name' in choice) != (kind == 'tool')
                or ('disable_parallel_tool_use' in choice and type(choice['disable_parallel_tool_use']) is not bool)):
            _invalid(INPUT_INVALID)
        if kind == 'tool':
            if not isinstance(choice['name'], str) or choice['name'] not in TOOLS:
                _invalid(INPUT_INVALID)
            result['tool_choice'] = {'type': 'function', 'function': {'name': choice['name']}}
        else:
            result['tool_choice'] = {'auto': 'auto', 'any': 'required', 'none': 'none'}[kind]
        if 'disable_parallel_tool_use' in choice:
            result['parallel_tool_calls'] = not choice['disable_parallel_tool_use']
    _json_bytes(result, STRUCTURED_MODEL_LIMITS.max_request_bytes, INPUT_INVALID)
    return result


async def _close(client):
    task, cancelled = asyncio.create_task(client.aclose()), False
    with anyio.CancelScope(shield=True):
        while not task.done():
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                cancelled = True
        try:
            task.result()
        except Exception:
            raise RuntimeError('AGENT_MODEL_FAILED') from None
    if cancelled:
        raise asyncio.CancelledError


class StructuredModelProxy:
    """Single attempt through the existing pinned Provider network policy."""
    def __init__(self, config, *, provider_factory=OpenAiCompatibleProvider):
        if (not isinstance(config, ProviderConfig) or not callable(provider_factory)
                or config.auth_mode not in ('none', 'bearer')
                or (config.auth_mode == 'bearer' and (not isinstance(config.api_key, str)
                    or not config.api_key or len(config.api_key) > 4096 or not config.api_key.isascii()
                    or re.search(r'[\x00-\x20\x7f]', config.api_key)))):
            _invalid(INPUT_INVALID)
        _model_text(config.model, INPUT_INVALID)
        self.config, self.model_label, self._factory = config, config.model, provider_factory

    @property
    def limits(self):
        return STRUCTURED_MODEL_LIMITS

    async def __call__(self, body: dict) -> dict:
        payload = _payload(body, self.config.model)  # Before provider/DNS/client.
        wire = _json_bytes(payload, self.limits.max_request_bytes, INPUT_INVALID)
        client, dependencies = None, None
        try:
            async with asyncio.timeout(self.limits.total_timeout_seconds):
                provider = self._factory(self.config, total_timeout_seconds=30, read_timeout_seconds=30,
                    max_output_tokens=self.limits.max_output_tokens, max_stream_bytes=self.limits.max_response_bytes)
                if not isinstance(provider, OpenAiCompatibleProvider):
                    raise RuntimeError('AGENT_MODEL_FAILED')
                options = await provider._connection_options(provider._endpoint())
                dependencies = provider._load_dependencies()
                client = provider._build_http_client(dependencies, options)
                # Explicit ownership also covers cancellation during __aenter__;
                # all closing runs in the shielded finally, never half-cancelled
                # in a client's automatic __aexit__.
                await client.__aenter__()
                response = await client.post(options.endpoint, content=wire, headers={'Content-Type': 'application/json'})
                if response.status_code != 200:
                    raise RuntimeError('AGENT_MODEL_FAILED')
                value = _decode_json(response.content, self.limits.max_response_bytes, RESPONSE_INVALID)
                result = response_to_messages(value, self.config.model)
                if result['usage']['output_tokens'] > payload['max_tokens']:
                    _invalid(RESPONSE_INVALID)
                previous_ids = {call['id'] for row in payload['messages'] for call in row.get('tool_calls', [])}
                if any(block['type'] == 'tool_use' and block['id'] in previous_ids for block in result['content']):
                    _invalid(RESPONSE_INVALID)
                return result
        except asyncio.CancelledError:
            raise
        except ValueError as error:
            if str(error) == RESPONSE_INVALID:
                _invalid(RESPONSE_INVALID)
            raise RuntimeError('AGENT_MODEL_FAILED') from None
        except Exception as error:
            timeout_type = getattr(getattr(dependencies, 'httpx2', None), 'TimeoutException', None)
            if _exception_tree_contains(error, _McpResponseTooLarge):
                raise RuntimeError('AGENT_MODEL_RESPONSE_TOO_LARGE') from None
            if (isinstance(error, AiDomainError) and error.code == 'AI_PROVIDER_TIMEOUT'
                    or _exception_tree_is_timeout(error, timeout_type)):
                raise RuntimeError('AGENT_MODEL_TIMEOUT') from None
            raise RuntimeError('AGENT_MODEL_FAILED') from None
        finally:
            if client is not None:
                await _close(client)
