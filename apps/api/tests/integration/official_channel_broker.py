"""Host-only fixed official proxy broker; no wire value selects a destination."""

import asyncio
from contextvars import ContextVar
import hashlib
import logging
import os
from pathlib import Path
import re
import stat

from official_channel_codec import (canonical, decode_request, encode_response,
    exact, fail, strict_json)
from official_channel_guest import drain

MODEL = 'gpt-6.1-sol'
TOOLS = frozenset(('blog_search_public', 'blog_read_public'))
BASE = ('model', 'input', 'tools', 'tool_choice', 'parallel_tool_calls', 'reasoning', 'truncation')
CONTROLS = {'max_output_tokens': 1024, 'store': False, 'stream': False}
DIAGNOSTIC_MESSAGE = 'OpenAI local request failed stage=%s status=%s category=%s line=%d'
PROVIDER_STAGES = frozenset(('connect', 'request', 'decode', 'count_connect',
    'count_request', 'count_decode', 'count_adapt', 'adapt', 'controls', 'total'))
BROKER_STAGES = frozenset(('validate', 'budget', 'binding', 'upstream',
    'response_encode', 'response_adapt', 'usage', 'channel'))
CATEGORIES = frozenset(('AGENT_MODEL_FAILED', 'AGENT_MODEL_TIMEOUT',
    'AGENT_MODEL_RESPONSE_INVALID', 'AGENT_MODEL_INPUT_INVALID',
    'AGENT_MODEL_RESPONSE_TOO_LARGE', 'AGENT_CHANNEL_INVALID'))
_DIAGNOSTIC = ContextVar('official_channel_diagnostic', default=None)


class _FailureDiagnostics(logging.Handler):
    def __init__(self, events):
        super().__init__()
        self.events, self.seen = events, set()

    def emit(self, record):
        try:
            context = _DIAGNOSTIC.get()
            if (context is None or not context['active'] or context['candidate'] is not None
                    or type(record.msg) is not str or record.msg != DIAGNOSTIC_MESSAGE
                    or type(record.args) is not tuple or len(record.args) != 4):
                return
            stage, status, category, line = record.args
            if (type(stage) is not str or stage not in PROVIDER_STAGES
                    or type(category) is not str or category not in CATEGORIES
                    or (status is not None and (type(status) is not int or not 100 <= status <= 599))
                    or type(line) is not int or not 0 <= line <= 65536):
                return
            context['candidate'] = (stage, category, status, line)
        except Exception:
            pass  # Never format a record or invoke handleError/getMessage.

    def add(self, identity, op, stage, category, status=None, line=0):
        try:
            if (type(identity) is not int or not 1 <= identity <= 64
                    or type(op) is not str or op not in ('count', 'generate')
                    or type(stage) is not str or stage not in PROVIDER_STAGES | BROKER_STAGES
                    or type(category) is not str or category not in CATEGORIES
                    or (status is not None and (type(status) is not int or not 100 <= status <= 599))
                    or type(line) is not int or not 0 <= line <= 65536
                    or identity in self.seen or len(self.events) >= 64):
                return
            self.events.append({'id': identity, 'op': op, 'stage': stage,
                'category': category, 'status': status, 'line': line})
            self.seen.add(identity)
        except Exception:
            pass


def _category(error, fallback):
    if isinstance(error, TimeoutError):
        return 'AGENT_MODEL_TIMEOUT'
    if type(error) in (RuntimeError, ValueError):
        args = error.args
        if type(args) is tuple and len(args) == 1 and type(args[0]) is str and args[0] in CATEGORIES:
            return args[0]
    return fallback


def validate_wire(raw, *, counting):
    value = strict_json(raw, 131072)
    if (not exact(value, BASE if counting else (*BASE, *CONTROLS))
            or value['model'] != MODEL or value['parallel_tool_calls'] is not False
            or value['reasoning'] != {'effort': 'low'} or value['truncation'] != 'disabled'
            or type(value['tools']) is not list or len(value['tools']) != 2
            or type(value['input']) is not list or not 1 <= len(value['input']) <= 1024
            or (not counting and any(type(value[key]) is not type(expected) or value[key] != expected
                for key, expected in CONTROLS.items())) or canonical(value) != raw):
        raise fail()
    if counting and len(canonical({**value, **CONTROLS})) > 131072:
        raise fail()
    names = set()
    for tool in value['tools']:
        if (not exact(tool, ('type', 'name', 'description', 'parameters', 'strict'))
                or tool['type'] != 'function' or type(tool['name']) is not str
                or tool['name'] not in TOOLS or tool['name'] in names
                or tool['strict'] is not False or type(tool['description']) is not str
                or type(tool['parameters']) is not dict
                or tool['parameters'].get('type') != 'object'
                or type(tool['parameters'].get('properties')) is not dict):
            raise fail()
        names.add(tool['name'])
    choice = value['tool_choice']
    if not (type(choice) is str and choice in ('auto', 'none', 'required')):
        if not exact(choice, ('type', 'name')) or choice['type'] != 'function' or choice['name'] not in TOOLS:
            raise fail()
    pending, seen, user = set(), set(), False
    for index, row in enumerate(value['input']):
        if exact(row, ('role', 'content')):
            if (row['role'] not in ('system', 'user') or type(row['content']) is not str
                    or not row['content'] or pending or (row['role'] == 'system' and index != 0)):
                raise fail()
            user |= row['role'] == 'user'
        elif exact(row, ('type', 'call_id', 'name', 'arguments')):
            if (row['type'] != 'function_call' or type(row['call_id']) is not str
                    or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', row['call_id'])
                    or row['call_id'] in seen or len(pending) >= 4
                    or type(row['name']) is not str or row['name'] not in TOOLS
                    or type(row['arguments']) is not str
                    or type(strict_json(row['arguments'].encode(), 16384)) is not dict):
                raise fail()
            pending.add(row['call_id'])
            seen.add(row['call_id'])
        elif exact(row, ('type', 'call_id', 'output')):
            if (row['type'] != 'function_call_output' or type(row['call_id']) is not str
                    or row['call_id'] not in pending or type(row['output']) is not str):
                raise fail()
            pending.remove(row['call_id'])
        else:
            raise fail()
    if pending or not user:
        raise fail()
    return value


class _OwnedSink:
    def __init__(self, path, maximum):
        self.fd = None
        try:
            self.path = Path(path)
            if not self.path.is_absolute():
                raise fail()
            for directory in reversed(self.path.parents):
                if not stat.S_ISDIR(directory.lstat().st_mode):
                    raise fail()
            parent = self.path.parent.lstat()
            if parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) != 0o700:
                raise fail()
            self.parent = (parent.st_dev, parent.st_ino)
            self.fd = os.open(path, os.O_WRONLY | os.O_NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC)
            self.identity = os.fstat(self.fd)
            self.maximum = maximum
            self.verify()
            if self.identity.st_size != 0:
                raise fail()
        except Exception:
            if self.fd is not None:
                os.close(self.fd)
                self.fd = None
            raise fail() from None

    def verify(self):
        info, parent = self.path.lstat(), self.path.parent.lstat()
        if (not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid() or info.st_nlink != 1
                or stat.S_IMODE(info.st_mode) != 0o600
                or (info.st_dev, info.st_ino) != (self.identity.st_dev, self.identity.st_ino)
                or (parent.st_dev, parent.st_ino) != self.parent
                or parent.st_uid != os.getuid() or stat.S_IMODE(parent.st_mode) != 0o700):
            raise fail()

    def write(self, raw):
        if type(raw) is not bytes or not 1 <= len(raw) <= self.maximum:
            raise fail()
        self.verify()
        offset = 0
        while offset < len(raw):
            size = os.write(self.fd, raw[offset:])
            if size <= 0:
                raise fail()
            offset += size
        os.fsync(self.fd)
        self.verify()

    def close(self):
        if self.fd is not None:
            descriptor, self.fd = self.fd, None
            os.close(descriptor)


async def serve_official_channel(frames, *, evaluation_path, summary_path, proxy=None):
    summary = {'version': 'sun-world-linux-official-broker/1', 'model': MODEL,
        'count_requests': 0, 'generation_requests': 0, 'cancel_requests': 0,
        'failed_requests': 0, 'channel_eof': False, 'close_confirmed': False,
        'evaluation_saved': False, 'evaluation_sha256': None, 'successful_requests': [],
        'failure_events': []}
    diagnostics = _FailureDiagnostics(summary['failure_events'])
    logger = logging.getLogger('src.modules.ai.openai_responses')
    def record_failure(*args):
        try:
            diagnostics.add(*args)
        except Exception:
            pass
    sinks, reader, active = [], None, None
    last_id, current, evaluation_attempted = 0, None, False
    bindings, cancelled = {}, set()
    interrupted, failed = False, False

    async def upstream(identity, op, raw, value, wire_hash, expected):
        context = {'active': True, 'candidate': None}
        token = _DIAGNOSTIC.set(context)
        stage = 'upstream'
        try:
            counting = op == 'count'
            async with asyncio.timeout(8 if counting else 45):
                result = await proxy._post(raw, counting=counting)
            stage = 'response_encode'
            response = canonical(result)
            if len(response) > (4096 if counting else 65536):
                raise RuntimeError('AGENT_MODEL_RESPONSE_TOO_LARGE')
            result = strict_json(response, 4096 if counting else 65536)
            stage = 'response_adapt'
            if counting:
                if (not exact(result, ('object', 'input_tokens'))
                        or result['object'] != 'response.input_tokens'
                        or type(result['input_tokens']) is not int
                        or not 1 <= result['input_tokens'] <= 2147483647):
                    raise fail()
                tokens, output = result['input_tokens'], 0
                expected_hash = hashlib.sha256(canonical({**value, **CONTROLS})).hexdigest()
                if tokens <= 16384:
                    bindings.setdefault(expected_hash, []).append(tokens)
            else:
                from src.modules.ai.openai_responses import responses_result
                converted = responses_result(result)
                tokens, output = converted['usage']['input_tokens'], converted['usage']['output_tokens']
                stage = 'usage'
                if tokens != expected:
                    raise fail()
            summary['successful_requests'].append({'id': identity, 'op': op,
                'wire_sha256': wire_hash, 'input_tokens': tokens, 'output_tokens': output})
            return 'ok', response
        except asyncio.CancelledError:
            raise
        except Exception as error:
            summary['failed_requests'] += 1
            candidate = context['candidate'] if stage == 'upstream' else None
            if candidate is None:
                fallback = 'AGENT_MODEL_FAILED' if stage == 'upstream' else 'AGENT_MODEL_RESPONSE_INVALID'
                candidate = (stage, _category(error, fallback), None, 0)
            record_failure(identity, op, *candidate)
            return 'failed', b''
        finally:
            context['active'] = False
            _DIAGNOSTIC.reset(token)

    async def cleanup():
        clean = True
        if active is not None and not active.done() and not active.cancelling():
            active.cancel()
        if reader is not None and not reader.done() and not reader.cancelling():
            reader.cancel()
        for task in (active, reader):
            if task is not None:
                try:
                    await drain(task)
                except asyncio.CancelledError:
                    pass
                except Exception:
                    clean = False
        try:
            await frames.aclose()
            clean &= frames.closed is True
        except Exception:
            clean = False
        summary['close_confirmed'] = clean
        error = not clean
        try:
            if len(sinks) == 2:
                sinks[1].write(canonical(summary))
        except Exception:
            error = True
        finally:
            for sink in sinks:
                try:
                    sink.close()
                except Exception:
                    error = True
        if error:
            raise fail()

    try:
        try:
            logger.addHandler(diagnostics)
        except Exception:
            pass
        sinks.append(_OwnedSink(evaluation_path, 262144))
        sinks.append(_OwnedSink(summary_path, 65536))
        if (sinks[0].identity.st_dev, sinks[0].identity.st_ino) == (sinks[1].identity.st_dev, sinks[1].identity.st_ino):
            raise fail()
        if proxy is None:
            from src.modules.ai.local_openai import create_local_openai_proxy
            proxy = create_local_openai_proxy(proxy_url='http://127.0.0.1:7890')
        reader = asyncio.create_task(frames.read_frame())
        while True:
            waiting = {reader, active} if active is not None else {reader}
            done, _ = await asyncio.wait(waiting, return_when=asyncio.FIRST_COMPLETED)
            if reader in done:
                frame = reader.result()
                reader = None
                if frame is None:
                    summary['channel_eof'] = True
                    break
                identity, op, raw = decode_request(frame)
                reader = asyncio.create_task(frames.read_frame())
                if op == 'cancel':
                    if identity != last_id:
                        raise fail()
                    if identity not in cancelled:
                        cancelled.add(identity)
                        summary['cancel_requests'] += 1
                        if active is not None and not active.done() and not active.cancelling():
                            active.cancel()
                else:
                    if active is not None or identity <= last_id:
                        raise fail()
                    last_id, current = identity, (identity, op)
                    if op in ('count', 'generate'):
                        stage = 'budget'
                        try:
                            counter = 'count_requests' if op == 'count' else 'generation_requests'
                            if summary[counter] >= 16:
                                raise fail()
                            summary[counter] += 1  # Before task scheduling/cancellation.
                            stage = 'validate'
                            value = validate_wire(raw, counting=op == 'count')
                            wire_hash = hashlib.sha256(raw).hexdigest()
                            expected = None
                            if op == 'generate':
                                stage = 'binding'
                                if not bindings.get(wire_hash):
                                    raise fail()
                                expected = bindings[wire_hash].pop(0)
                            active = asyncio.create_task(upstream(identity, op, raw, value, wire_hash, expected))
                        except Exception:
                            summary['failed_requests'] += 1
                            record_failure(identity, op, stage, 'AGENT_MODEL_INPUT_INVALID')
                            await frames.write_frame(encode_response(identity, 'failed', op=op))
                            current = None
                    else:
                        if op == 'probe':
                            payload = canonical({'ready': True})
                        else:
                            if evaluation_attempted:
                                raise fail()
                            evaluation_attempted = True
                            value = strict_json(raw)
                            if type(value) is not dict or value.get('version') != 'sun-world-agent-model-report/1':
                                raise fail()
                            sinks[0].write(raw)
                            summary['evaluation_saved'] = True
                            summary['evaluation_sha256'] = hashlib.sha256(raw).hexdigest()
                            payload = canonical({'sha256': summary['evaluation_sha256']})
                        await frames.write_frame(encode_response(identity, 'ok', payload, op=op))
                        current = None
            if active is not None and active.done():
                if active.cancelled():
                    status, payload = 'cancelled', b''
                else:
                    status, payload = active.result()
                identity, op = current
                await frames.write_frame(encode_response(identity, status, payload, op=op))
                active, current = None, None
    except asyncio.CancelledError:
        interrupted = True
    except Exception:
        failed = True
        summary['failed_requests'] += 1
        if current is not None and current[1] in ('count', 'generate'):
            record_failure(*current, 'channel', 'AGENT_CHANNEL_INVALID')
    finally:
        task = asyncio.create_task(cleanup())
        try:
            _, additional_cancel = await drain(task)
            interrupted |= additional_cancel
        except asyncio.CancelledError:
            interrupted = True
        except Exception:
            failed = True
        finally:
            try:
                logger.removeHandler(diagnostics)
                diagnostics.close()
            except Exception:
                pass
    if interrupted:
        raise asyncio.CancelledError
    if failed:
        raise fail()
    return summary
