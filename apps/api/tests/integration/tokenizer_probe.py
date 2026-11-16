"""Explicit local-only, non-generating capability probe. Never embed in an app.

The temporary fixed-origin environment policy is process scoped. Counts observe
the tokenize projection, not generation-wire equivalence or artifact identity.
"""

import asyncio
import hashlib
import json
import os
from pathlib import Path
import re
import stat

from src.modules.ai.errors import AiDomainError
from src.modules.ai.mcp_gateway import _McpResponseTooLarge, _exception_tree_contains, _exception_tree_is_timeout
from src.modules.ai.model_proxy import _close, _decode_json, _payload
from src.modules.ai.providers import OpenAiCompatibleProvider, ProviderConfig
from src.modules.ai.public import create_keyless_validation_proxy

ORIGIN = 'http://211.141.18.165:6195'
MODEL = 'qwen38_27b'
LIMIT = 65536
REPORT_LIMIT = 16384
INVALID = 'AGENT_TOKENIZER_RESPONSE_INVALID'
ERRORS = frozenset({INVALID, 'AGENT_TOKENIZER_POLICY_REJECTED', 'AGENT_TOKENIZER_TIMEOUT',
    'AGENT_TOKENIZER_RESPONSE_TOO_LARGE', 'AGENT_TOKENIZER_TRANSPORT_FAILED',
    'AGENT_TOKENIZER_CLOSE_FAILED', 'AGENT_TOKENIZER_CANCELLED', 'AGENT_TOKENIZER_FAILED'})
METADATA = ('models', 'version', 'tokenizer_info')
CASES = ('unicode', 'tools', 'tool_history')


def fail(code=INVALID):
    raise ValueError(code) from None


def integer(value, maximum=2**63 - 1):
    if type(value) is not int or not 0 <= value <= maximum:
        fail()
    return value


def text(value, *, nullable=False):
    if (value is None and nullable) or type(value) is str:
        return value
    fail()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def present(value, keys):
    return [key for key in keys if key in value]


def metadata_shape(name, value):
    """Unknown metadata names/values are ignored, never copied into evidence."""
    if type(value) is not dict:
        fail()
    if name == 'version':
        version = value.get('version')
        if type(version) is not str or not re.fullmatch(r'[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}(?:rc[0-9]{1,3})?', version):
            fail()
        return {'known_fields': present(value, ('version',)), 'server_version': version}
    if name == 'models':
        if value.get('object') != 'list' or type(value.get('data')) is not list or len(value['data']) > 32:
            fail()
        selected = None
        for item in value['data']:
            if type(item) is not dict or type(item.get('id')) is not str:
                fail()
            if item['id'] == MODEL:
                if selected is not None:
                    fail()
                selected = item
        result = {'known_fields': present(value, ('object', 'data')),
            'model_count': len(value['data']), 'alias_matches': selected is not None}
        if selected is not None:
            result['model_known_fields'] = present(selected, ('id', 'object', 'created', 'owned_by',
                'root', 'parent', 'max_model_len', 'permission'))
            if 'max_model_len' in selected:
                result['max_model_len'] = integer(selected['max_model_len'], 2**31 - 1)
            if 'root' in selected and text(selected['root'], nullable=True) is not None:
                # A metadata string digest is explicitly not artifact identity.
                result['metadata_root_sha256'] = digest(selected['root'].encode('utf-8'))
        return result
    if name != 'tokenizer_info':
        fail()
    keys = ('tokenizer_class', 'chat_template', 'chat_template_sha256', 'tokenizer_revision',
        'model_revision', 'bos_token', 'eos_token', 'vocab_size')
    result = {'known_fields': present(value, keys)}
    for key in keys:
        if key not in value:
            continue
        if key == 'vocab_size':
            result[key] = integer(value[key], 2**31 - 1)
        else:
            text(value[key], nullable=True)
    if isinstance(value.get('chat_template'), str):
        result['chat_template_sha256'] = digest(value['chat_template'].encode('utf-8'))
    return result


def tokenize_shape(value):
    if (type(value) is not dict or not {'count', 'max_model_len', 'tokens'} <= value.keys()
            or value.keys() - {'count', 'max_model_len', 'tokens', 'token_strs'}
            or value.get('token_strs') is not None):
        fail()
    tokens = value['tokens']
    if type(tokens) is not list or len(tokens) > LIMIT:
        fail()
    count = integer(value['count'], LIMIT)
    if count != len(tokens):
        fail()
    for token in tokens:
        integer(token)
    return {'known_fields': present(value, ('count', 'max_model_len', 'tokens', 'token_strs')),
        'count': count, 'max_model_len': integer(value['max_model_len'], 2**31 - 1)}


def requests():
    tools = [
        {'name': 'blog_search_public', 'description': 'Search public articles.', 'input_schema': {
            'type': 'object', 'properties': {'query': {'type': 'string'}}, 'required': ['query']}},
        {'name': 'blog_read_public', 'description': 'Read public article.', 'input_schema': {
            'type': 'object', 'properties': {'article_id': {'type': 'integer'}}, 'required': ['article_id']}},
    ]
    for name in CASES:
        body = {'max_tokens': 1024, 'stream': False, 'thinking': {'type': 'disabled'},
            'tools': tools, 'messages': [{'role': 'user', 'content': '合成分词测试 English café 👩🏽‍💻 e\u0301。'}]}
        if name == 'tool_history':
            body['messages'].extend([
                {'role': 'assistant', 'content': [{'type': 'tool_use', 'id': 'synthetic_read_1',
                    'name': 'blog_read_public', 'input': {'article_id': 1}}]},
                {'role': 'user', 'content': [{'type': 'tool_result', 'tool_use_id': 'synthetic_read_1',
                    'content': 'Synthetic public article. 合成公开文章。'}]},
            ])
        converted = _payload(body, MODEL)
        projection = {'model': converted['model'], 'messages': converted['messages'],
            'add_generation_prompt': True, 'continue_final_message': False,
            'add_special_tokens': False, 'return_token_strs': False}
        if name != 'unicode':
            projection['tools'] = converted['tools']
        yield name, json.dumps(projection, ensure_ascii=False, allow_nan=False, separators=(',', ':')).encode('utf-8')


def approved(config):
    if (not isinstance(config, ProviderConfig) or config.provider != 'qwen-public' or config.model != MODEL
            or config.base_url != ORIGIN + '/v1' or config.auth_mode != 'none' or config.api_key is not None):
        fail('AGENT_TOKENIZER_POLICY_REJECTED')


def create_report(path):
    if not isinstance(path, (str, Path)) or not Path(path).is_absolute():
        fail('AGENT_TOKENIZER_FAILED')
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        if (not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600
                or info.st_uid != os.getuid() or info.st_nlink != 1):
            fail('AGENT_TOKENIZER_FAILED')
    except BaseException:
        os.close(descriptor)
        raise
    return descriptor


def save(descriptor, report):
    raw = json.dumps(report, ensure_ascii=True, allow_nan=False, separators=(',', ':')).encode('ascii')
    if len(raw) > REPORT_LIMIT:
        fail('AGENT_TOKENIZER_FAILED')
    os.lseek(descriptor, 0, os.SEEK_SET)
    offset = 0
    while offset < len(raw):
        written = os.write(descriptor, raw[offset:])
        if written <= 0:
            fail('AGENT_TOKENIZER_FAILED')
        offset += written
    os.ftruncate(descriptor, len(raw))
    os.fsync(descriptor)


async def request(config, method, path, wire=None):
    approved(config)
    if (type(method) is not str or type(path) is not str
            or not (method == 'GET' and path in ('/v1/models', '/version', '/tokenizer_info') and wire is None
                or method == 'POST' and path == '/tokenize' and type(wire) is bytes
                and any(wire == fixed for _, fixed in requests()))):
        fail('AGENT_TOKENIZER_POLICY_REJECTED')
    client, primary, dependencies = None, None, None
    try:
        async with asyncio.timeout(8):
            provider = OpenAiCompatibleProvider(config, connect_timeout_seconds=2, read_timeout_seconds=8,
                write_timeout_seconds=2, pool_timeout_seconds=1, total_timeout_seconds=8,
                max_stream_bytes=LIMIT, max_output_tokens=1024)
            options = await provider._connection_options(ORIGIN + path)
            dependencies = provider._load_dependencies()
            client = provider._build_http_client(dependencies, options)
            await client.__aenter__()
            response = await client.request(method, options.endpoint, content=wire,
                headers={'Content-Type': 'application/json'} if wire is not None else {})
            if response.status_code == 404 and method == 'GET':
                return {'status': 'unavailable'}
            if response.status_code != 200:
                fail('AGENT_TOKENIZER_TRANSPORT_FAILED')
            value = _decode_json(response.content, LIMIT, INVALID)
            name = {'/v1/models': 'models', '/version': 'version', '/tokenizer_info': 'tokenizer_info'}.get(path)
            shape = metadata_shape(name, value) if method == 'GET' else tokenize_shape(value)
            return {'status': 'ok', 'response_sha256': digest(response.content), **shape}
    except BaseException as error:
        primary = error
        if isinstance(error, asyncio.CancelledError):
            raise
        if isinstance(error, ValueError) and str(error) in ERRORS:
            raise ValueError(str(error)) from None
        if _exception_tree_contains(error, _McpResponseTooLarge):
            fail('AGENT_TOKENIZER_RESPONSE_TOO_LARGE')
        timeout = getattr(getattr(dependencies, 'httpx2', None), 'TimeoutException', None)
        if _exception_tree_is_timeout(error, timeout) or isinstance(error, AiDomainError) and error.code == 'AI_PROVIDER_TIMEOUT':
            fail('AGENT_TOKENIZER_TIMEOUT')
        if isinstance(error, AiDomainError):
            fail('AGENT_TOKENIZER_POLICY_REJECTED')
        fail('AGENT_TOKENIZER_TRANSPORT_FAILED')
    finally:
        if client is not None:
            try:
                await _close(client)
            except asyncio.CancelledError:
                raise
            except Exception:
                if primary is None:
                    fail('AGENT_TOKENIZER_CLOSE_FAILED')


async def probe(report_path):
    # Factory and exact fixed configuration check precede file creation or DNS.
    try:
        config = create_keyless_validation_proxy().config
    except Exception:
        fail('AGENT_TOKENIZER_POLICY_REJECTED')
    approved(config)
    wires = list(requests())
    descriptor = create_report(report_path)
    report = {'version': 'sun-world-tokenizer-probe/1', 'status': 'running', 'model_alias': MODEL,
        'active_case': None, 'inference_performed': False,
        'projection': 'tokenize_protocol_not_generation_wire', 'tokenizer_verified': False,
        'sample': 'fixed_synthetic_messages_and_tools_not_sdk_request',
        'immutable_model_revision_verified': False, 'input_token_hard_limit_verified': False, 'observations': []}
    policy_key = 'AI_PROVIDER_ALLOWED_INSECURE_ORIGINS'
    previous = os.environ.get(policy_key)
    try:
        save(descriptor, report)
        os.environ[policy_key] = ORIGIN
        async with asyncio.timeout(45):
            for name, path in zip(METADATA, ('/v1/models', '/version', '/tokenizer_info')):
                observation = {'case': name, 'status': 'running'}
                report['observations'].append(observation)
                report['active_case'] = name
                save(descriptor, report)
                observation.update(await request(config, 'GET', path))
                save(descriptor, report)
            for name, wire in wires:
                observation = {'case': name, 'status': 'running', 'request_sha256': digest(wire)}
                report['observations'].append(observation)
                report['active_case'] = name
                save(descriptor, report)
                observation.update(await request(config, 'POST', '/tokenize', wire))
                save(descriptor, report)
        report['status'] = 'ok'
        report['active_case'] = None
        return 0
    except asyncio.CancelledError:
        report.update(status='cancelled', error='AGENT_TOKENIZER_CANCELLED')
        if report['observations'] and report['observations'][-1]['status'] == 'running':
            report['observations'][-1]['status'] = 'cancelled'
        raise
    except Exception as error:
        report.update(status='failed', error=str(error) if isinstance(error, ValueError) and str(error) in ERRORS
            else 'AGENT_TOKENIZER_TIMEOUT' if isinstance(error, TimeoutError) else 'AGENT_TOKENIZER_FAILED')
        if report['observations'] and report['observations'][-1]['status'] == 'running':
            report['observations'][-1].update(status='failed', error=report['error'])
        return 1
    finally:
        try:
            save(descriptor, report)
        finally:
            try:
                os.close(descriptor)
            finally:
                if previous is None:
                    os.environ.pop(policy_key, None)
                else:
                    os.environ[policy_key] = previous
