"""Formal, unexposed tool/model/result gateway; mandatory live authorization hooks.

No HTTP composition or production admission is added here. Synchronous entrypoints
must run on a worker thread; model() bridges DB operations to worker threads.
"""

import asyncio
import hashlib
import hmac
import json
import re
import secrets
from collections import OrderedDict
from dataclasses import dataclass, field
from threading import RLock
from urllib.parse import urlsplit
from uuid import uuid4

from src.core.auth import Principal
from src.core.csrf import canonical_origin
from src.modules.ai.public import agent_answer_blocks
from .cleanup import finish_cleanup, run_sync
from .journal import ToolJournal
from .ledger import LedgerError, digest, family_hash
from .model_budget import ModelJournal, model_usage


TOOL_IDS = frozenset({'blog.search_public', 'blog.read_public'})
NO_SOURCES = '未找到相关公开文章。'


def encode(value):
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
    except (TypeError, ValueError, UnicodeError):
        raise LedgerError('AGENT_INPUT_INVALID') from None


def token_hash(value):
    if not isinstance(value, str) or not re.fullmatch('[A-Za-z0-9_-]{32,128}', value):
        raise LedgerError('AGENT_CREDENTIAL_INVALID')
    return hashlib.sha256(value.encode('ascii')).hexdigest()


@dataclass(frozen=True)
class RunCall:
    run_id: str
    execution_id: str
    generation: int
    service_credential: str = field(repr=False)
    token: str = field(repr=False)


@dataclass(frozen=True)
class RunCredentials:
    tool: str = field(repr=False)
    model: str = field(repr=False)
    result: str = field(repr=False)

    def hashes(self):
        return {audience: token_hash(getattr(self, audience)) for audience in ('tool', 'model', 'result')}


class ResultCache:
    """Bounded volatile public response cache. Loss never triggers a re-read."""
    def __init__(self):
        self.entries = OrderedDict()
        self.size = 0
        self.lock = RLock()

    def put(self, key, response, expires):
        raw = encode(response)
        with self.lock:
            old = self.entries.pop(key, None)
            if old:
                self.size -= len(old[0])
            self.entries[key] = (raw, expires)
            self.size += len(raw)
            while len(self.entries) > 32 or self.size > 131072:
                _, (discarded, _) = self.entries.popitem(last=False)
                self.size -= len(discarded)

    def get(self, key, now):
        with self.lock:
            for candidate, (raw, expiry) in list(self.entries.items()):
                if expiry <= now:
                    self.entries.pop(candidate)
                    self.size -= len(raw)
            row = self.entries.get(key)
            return json.loads(row[0]) if row else None


class RunGateway:
    def __init__(self, ledger, *, registry, handlers, enabled, authorize, allow,
                 worker_credential, bundle_hash, model_id, model_proxy, site_origin, source_reader):
        if set(handlers) != TOOL_IDS or not callable(enabled) or not callable(authorize) or not callable(allow) or not callable(model_proxy) or not callable(source_reader):
            raise ValueError('Gateway requires fixed tools and live authorization hooks')
        if not isinstance(bundle_hash, str) or not re.fullmatch('[0-9a-f]{64}', bundle_hash):
            raise ValueError('Invalid bundle hash')
        for tool_id in TOOL_IDS:
            tool = registry.tools[tool_id]
            if tool.version != '1' or tool.effect != 'read' or tool.data_class != 'public' or tool.confirmation != 'none':
                raise ValueError('Invalid read-only profile')
        origin = canonical_origin(site_origin)
        parsed = urlsplit(site_origin)
        if not origin or parsed.scheme != 'https' or parsed.path not in {'', '/'} or parsed.query or parsed.fragment:
            raise ValueError('Gateway requires a canonical HTTPS site origin')
        self.ledger, self.registry, self.handlers = ledger, registry, dict(handlers)
        self.enabled, self.authorize, self.allow = enabled, authorize, allow
        self.worker_hash = token_hash(worker_credential)
        self.bundle_hash, self.model_id = bundle_hash, model_id
        self.model_proxy, self.origin, self.source_reader = model_proxy, origin, source_reader
        self.journal, self.cache = ToolJournal(), ResultCache()

    def _authorize(self, uow, row):
        try:
            if self.enabled() is not True:
                raise LedgerError('AGENT_DISABLED')
            principal = self.authorize(uow, row)
            if (not isinstance(principal, Principal) or principal.user_id != row['user_id']
                    or family_hash(principal) != row['session_family_hash']
                    or self.allow(principal, row, uow) is not True):
                raise LedgerError('AGENT_ACTIVE_SESSION_REQUIRED')
            if (row['app_id'] != 'sun-world' or row['scenario'] != 'blog-qa'
                    or row['bundle_hash'] != self.bundle_hash or row['model_id'] != self.model_id):
                raise LedgerError('AGENT_PROFILE_MISMATCH')
            return principal
        except LedgerError:
            raise
        except Exception:
            raise LedgerError('AGENT_ACTIVE_SESSION_REQUIRED') from None

    def claim(self, run_id, *, execution_id):
        credentials = RunCredentials(*(secrets.token_urlsafe(32) for _ in range(3)))
        def authorize(uow, row):
            self._authorize(uow, row)
            return True
        row = self.ledger.claim(run_id, execution_id=execution_id,
                                credential_hashes=credentials.hashes(), authorize=authorize)
        return (row, credentials) if row else None

    def _service(self, call):
        if not isinstance(call, RunCall) or not hmac.compare_digest(token_hash(call.service_credential), self.worker_hash):
            raise LedgerError('AGENT_CREDENTIAL_INVALID')

    def _check(self, uow, call, audience, *, live=True, row=None):
        if not isinstance(call, RunCall) or not hmac.compare_digest(token_hash(call.service_credential), self.worker_hash):
            raise LedgerError('AGENT_CREDENTIAL_INVALID')
        row = row if row is not None else self.ledger._binding(uow, call.run_id, call.execution_id, call.generation)
        expected = row.get(audience + '_credential_hash')
        if not isinstance(expected, str) or not hmac.compare_digest(token_hash(call.token), expected):
            raise LedgerError('AGENT_CREDENTIAL_INVALID')
        now = self.ledger.now()
        if row['deadline'] <= now:
            raise LedgerError('AGENT_EXECUTION_EXPIRED')
        principal = self._authorize(uow, row)
        if live:
            self.ledger._live(row, self.ledger.now())
        return row, principal

    def bind_root_turn(self, call, root_turn_id, *, root_request_id=None):
        self._service(call)
        def authorize(uow, row):
            self._check(uow, call, 'result', row=row)
            return True
        return self.ledger.bind_root_turn(call.run_id, execution_id=call.execution_id,
            generation=call.generation, root_turn_id=root_turn_id, root_request_id=root_request_id, authorize=authorize)

    def heartbeat(self, call):
        self._service(call)
        def authorize(uow, row):
            self._check(uow, call, 'result', row=row)
            return True
        return self.ledger.heartbeat(call.run_id, execution_id=call.execution_id,
            generation=call.generation, authorize=authorize)

    def _validate(self, call, audience, *, live=True):
        with self.ledger.unit_of_work() as uow:
            return self._check(uow, call, audience, live=live)[0]

    def _result(self, tool_id, principal, arguments):
        return self._checked_result(tool_id, self.handlers[tool_id](principal, arguments))

    def _checked_result(self, tool_id, result):
        tool = self.registry.tools[tool_id]
        result = self.registry.schemas[tool.output_schema_ref].model_validate(result).model_dump(mode='json')
        if tool_id == 'blog.read_public':
            actual = len(result['content'].encode())
            if actual > 16384 or result['returned_bytes'] != actual or result['content_bytes'] < actual:
                raise LedgerError('AGENT_OUTPUT_INVALID')
        if len(encode(result)) > 65536:
            raise LedgerError('AGENT_BUDGET_EXCEEDED')
        return result

    def tool(self, call, *, call_id, tool_id, tool_version, arguments):
        with self.ledger.unit_of_work() as uow:
            row, principal = self._check(uow, call, 'tool')
            if not isinstance(tool_id, str) or tool_id not in TOOL_IDS or tool_version != '1' or not isinstance(arguments, dict) or len(encode(arguments)) > 16384:
                raise LedgerError('AGENT_TOOL_INVALID')
            schema = self.registry.schemas[self.registry.tools[tool_id].input_schema_ref]
            try:
                normalized = schema.model_validate(arguments).model_dump(mode='json')
            except Exception:
                raise LedgerError('AGENT_INPUT_INVALID') from None
            old, created = self.journal.reserve_tool(uow, row, call_id=call_id, tool_id=tool_id,
                tool_version=tool_version, argument_hash=digest(normalized), now=self.ledger.now())
            uow.commit()
        key = (row['id'], row['generation'], call_id)
        if not created:
            cached = self.cache.get(key, self.ledger.now())
            if old['state'] in {'prepared', 'delivered'} and cached and cached['result_hash'] == old['result_hash']:
                self._validate(call, 'tool')
                return cached
            raise LedgerError('AGENT_CALL_PENDING' if old['state'] == 'reserved' else 'AGENT_CALL_RESULT_UNAVAILABLE')
        try:
            result = self._result(tool_id, principal, normalized)
            source_id = str(uuid4()) if tool_id == 'blog.read_public' else None
            response = dict(call_id=call_id, result=result, source_id=source_id)
            result_hash = hashlib.sha256(encode(response)).hexdigest()
            response['result_hash'] = result_hash
            source = None if tool_id != 'blog.read_public' else {
                'article_id': result['article_id'], 'title': result['title'], 'content_hash': result['content_hash'],
                'excerpt_hash': hashlib.sha256(result['content'].encode()).hexdigest(),
            }
            with self.ledger.unit_of_work() as uow:
                fresh, _ = self._check(uow, call, 'tool')
                self.journal.prepare(uow, fresh, call_id=call_id, result_hash=result_hash,
                    result_bytes=len(encode(response)), source=source, source_id=source_id, now=self.ledger.now())
                self._check(uow, call, 'tool', row=fresh)
                uow.commit()
            self.cache.put(key, response, row['deadline'])
            self._validate(call, 'tool')
            return response
        except Exception as exc:
            try:
                with self.ledger.unit_of_work() as uow:
                    fresh = self.ledger._binding(uow, call.run_id, call.execution_id, call.generation)
                    self.journal.fail_tool(uow, fresh, call_id, self.ledger.now())
                    uow.commit()
            except Exception:
                pass  # Preserve the original denial; cleanup is not authority.
            if isinstance(exc, LedgerError):
                raise
            raise LedgerError('AGENT_TOOL_FAILED') from None

    def receipt(self, call, *, call_id, result_hash):
        with self.ledger.unit_of_work() as uow:
            row, _ = self._check(uow, call, 'tool')
            self.journal.acknowledge(uow, row, call_id=call_id, result_hash=result_hash, now=self.ledger.now())
            uow.commit()
            return True

    def finish(self, call, *, root_session_id, root_turn_id, answer, source_ids, finish='completed', root_request_id=None):
        self._service(call)
        self._validate(call, 'result', live=False)
        try:
            invalid = finish != 'completed' or not isinstance(answer, str) or not answer.strip() or len(answer.encode()) > 32768
        except UnicodeError:
            invalid = True
        if invalid:
            raise LedgerError('AGENT_OUTPUT_INVALID')
        if re.search(r'\b[A-Za-z][\w+.-]*://|\bwww\.|</?[A-Za-z][^>]*>|\[[^\]]*\]\s*\(', answer):
            raise LedgerError('AGENT_OUTPUT_INVALID')
        def prepare(uow, row):
            _, principal = self._check(uow, call, 'result', live=row['status'] != 'completed', row=row)
            sources = self.journal.delivered_sources(uow, row, source_ids)
            links = []
            for source in sources:
                try:
                    current = self._checked_result('blog.read_public',
                        self.source_reader(uow, principal, source['article_id']))
                except Exception:
                    raise LedgerError('BLOG_SOURCE_CHANGED') from None
                if (current['content_hash'] != source['content_hash'] or current['title'] != source['title']
                        or hashlib.sha256(current['content'].encode()).hexdigest() != source['excerpt_hash']):
                    raise LedgerError('BLOG_SOURCE_CHANGED')
                links.append({'label': current['title'][:500] or f"文章 {source['article_id']}", 'url': f"{self.origin}/blog/{source['article_id']}"})
            self._check(uow, call, 'result', live=row['status'] != 'completed', row=row)
            return agent_answer_blocks(answer.strip() if links else NO_SOURCES, links)
        return self.ledger.commit_answer(call.run_id, execution_id=call.execution_id, generation=call.generation,
            root_session_id=root_session_id, root_turn_id=root_turn_id, root_request_id=root_request_id, prepare=prepare)

    async def model(self, call, body):
        self._service(call)
        if (not isinstance(body, dict) or len(encode(body)) > 131072
                or set(body) & {'api_key', 'headers', 'base_url', 'url', 'provider', 'user_id', 'run_id', 'owner'}):
            raise LedgerError('AGENT_INPUT_INVALID')
        # These are server-owned limits, never accepted from Worker/request
        # fields. Byte accounting is not a substitute for an input tokenizer.
        from src.modules.ai.public import STRUCTURED_MODEL_LIMITS as limits
        from src.modules.ai.public import is_counted_model_proxy
        payload = {**body, 'model': self.model_id, 'stream': False, 'max_tokens': limits.max_output_tokens}
        request_bytes = len(encode(payload))
        call_id, accounting = str(uuid4()), ModelJournal()
        proxy = self.model_proxy
        context = {'may_exist': False, 'observed': False}
        async def invoke():
            def reserve():
                with self.ledger.unit_of_work() as uow:
                    row, _ = self._check(uow, call, 'model')
                    accounting.reserve(uow, row, input_bytes=request_bytes, request_hash=digest(payload),
                                       call_id=call_id, now=self.ledger.now(), limits=limits)
                    context['may_exist'] = True
                    uow.commit()
                    return row
            row = await run_sync(reserve)
            remaining = (row['deadline'] - self.ledger.now()).total_seconds()
            if remaining <= 0:
                raise LedgerError('AGENT_EXECUTION_EXPIRED')
            async with asyncio.timeout(min(30, max(0, remaining))):
                async def provider_operation():
                    if not is_counted_model_proxy(proxy):
                        return await proxy(payload)
                    prepared = await proxy.prepare(payload)
                    metadata = proxy.input_metadata(prepared)
                    def reserve_input():
                        with self.ledger.unit_of_work() as uow:
                            current, _ = self._check(uow, call, 'model')
                            accounting.reserve_input(uow, current, call_id, metadata=metadata,
                                                     now=self.ledger.now())
                            uow.commit()
                            return current
                    current = await run_sync(reserve_input)
                    if current['deadline'] <= self.ledger.now():
                        raise LedgerError('AGENT_EXECUTION_EXPIRED')
                    await run_sync(self._validate, call, 'model')
                    return await proxy.generate(prepared)
                task = asyncio.create_task(provider_operation())
                try:
                    while not task.done():
                        await asyncio.wait({task}, timeout=.1)
                        await run_sync(self._validate, call, 'model')
                    result = await task
                    if (not isinstance(result, dict) or result.get('stop_reason') not in {'end_turn', 'tool_use', 'max_tokens'}
                            or not isinstance(result.get('content'), list) or result.get('model', self.model_id) != self.model_id):
                        raise LedgerError('AGENT_MODEL_FAILED')
                    response_bytes = len(encode(result))
                    if response_bytes > limits.max_response_bytes:
                        raise LedgerError('AGENT_BUDGET_EXCEEDED')
                    usage = model_usage(result, response_bytes, limits=limits)
                    def observe():
                        with self.ledger.unit_of_work() as uow:
                            current = self.ledger._binding(uow, call.run_id, call.execution_id, call.generation)
                            accounting.observe(uow, current, call_id, usage=usage,
                                               result_hash=digest(result), now=self.ledger.now())
                            uow.commit()
                            context['observed'] = True
                    await run_sync(observe)
                    await run_sync(self._validate, call, 'model')
                    return result
                finally:
                    async def cleanup():
                        if not task.done() and not task.cancelling():
                            task.cancel()
                        await asyncio.gather(task, return_exceptions=True)
                    await finish_cleanup(cleanup())
        try:
            return await invoke()
        except LedgerError:
            raise
        except TimeoutError:
            raise LedgerError('AGENT_MODEL_TIMEOUT') from None
        except Exception:
            raise LedgerError('AGENT_MODEL_FAILED') from None
        finally:
            if context['may_exist'] and not context['observed']:
                def mark_unknown():
                    with self.ledger.unit_of_work() as uow:
                        row = self.ledger._binding(uow, call.run_id, call.execution_id, call.generation)
                        accounting.unknown(uow, row, call_id, now=self.ledger.now())
                        uow.commit()
                async def cleanup_accounting():
                    try:
                        await run_sync(mark_unknown)
                    except Exception:
                        # Unknown DB acknowledgements never refund or trigger
                        # another provider request. A reserved row stays charged.
                        pass
                await finish_cleanup(cleanup_accounting())
