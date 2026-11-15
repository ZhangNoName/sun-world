"""Tool/source accounting on an already locked run and its existing transaction.

The gateway validates live sessions, leases, switches, service identity and
credential audience before calling these methods. No result bodies, arguments,
credentials, connection creation or transaction commit belong in this journal.
"""

import re
from datetime import datetime
from uuid import UUID, uuid4

from .ledger import LedgerError


TOOLS = frozenset({'blog.search_public', 'blog.read_public'})
CALL_STATES = frozenset({'reserved', 'prepared', 'delivered', 'failed'})
MAX_TOOL_CALLS = 4
MAX_MODEL_CALLS = 4
MAX_RESULT_BYTES = 65_536
_UNSET = object()


def _uuid(value):
    try:
        if not isinstance(value, str) or str(UUID(value)) != value:
            raise ValueError
    except (ValueError, TypeError, AttributeError):
        raise LedgerError('AGENT_INPUT_INVALID') from None
    return value


def _hash(value):
    if not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value):
        raise LedgerError('AGENT_INPUT_INVALID')
    return value


def _call_id(value):
    if (not isinstance(value, str) or not 1 <= len(value) <= 128
            or not value.isascii() or any(ord(char) < 33 or ord(char) > 126 for char in value)):
        raise LedgerError('AGENT_INPUT_INVALID')
    return value


def _context(run, now=_UNSET, *, allow_completed=False):
    if (not isinstance(run, dict) or type(run.get('generation')) is not int
            or run['generation'] != 1
            or run.get('status') not in ({'running', 'completed'} if allow_completed else {'running'})):
        raise LedgerError('AGENT_EXECUTION_INVALID')
    _uuid(run.get('id'))
    if now is not _UNSET and (not isinstance(now, datetime) or now.tzinfo is not None):
        raise LedgerError('AGENT_INPUT_INVALID')
    return run['id'], run['generation']


def _read_call(uow, run_id, generation, call_id):
    call = uow.fetch_one(
        'SELECT * FROM agent_tool_calls WHERE run_id=%s AND generation=%s AND call_id=%s FOR UPDATE',
        (run_id, generation, _call_id(call_id)),
    )
    if call and (call.get('state') not in CALL_STATES or call.get('tool_id') not in TOOLS
                 or call.get('tool_version') != '1'):
        raise LedgerError('AGENT_TOOL_INVALID')
    return call


class ToolJournal:
    def reserve_tool(self, uow, run, *, call_id, tool_id, tool_version, argument_hash, now):
        run_id, generation = _context(run, now)
        call_id, argument_hash = _call_id(call_id), _hash(argument_hash)
        if not isinstance(tool_id, str) or not isinstance(tool_version, str):
            raise LedgerError('AGENT_TOOL_INVALID')
        existing = _read_call(uow, run_id, generation, call_id)
        if existing:
            if (existing['tool_id'], existing['tool_version'], existing['argument_hash']) != (
                    tool_id, tool_version, argument_hash):
                raise LedgerError('AGENT_CALL_CONFLICT')
            return existing, False
        if tool_id not in TOOLS or tool_version != '1':
            raise LedgerError('AGENT_TOOL_INVALID')
        updated = uow.execute(
            "UPDATE agent_runs SET tool_count=tool_count+1 WHERE id=%s AND generation=%s "
            "AND status='running' AND tool_count>=0 AND tool_count<%s",
            (run_id, generation, MAX_TOOL_CALLS),
        )
        if updated != 1:
            raise LedgerError('AGENT_BUDGET_EXCEEDED')
        row = dict(run_id=run_id, generation=generation, call_id=call_id, tool_id=tool_id,
                   tool_version=tool_version, argument_hash=argument_hash, state='reserved',
                   result_hash=None, result_bytes=0, error_code=None, created_at=now, updated_at=now)
        columns, placeholders = ', '.join(row), ', '.join(['%s'] * len(row))
        uow.execute(f'INSERT INTO agent_tool_calls ({columns}) VALUES ({placeholders})', tuple(row.values()))
        return row, True

    def prepare(self, uow, run, *, call_id, result_hash, result_bytes, source, now, source_id=None):
        run_id, generation = _context(run, now)
        result_hash = _hash(result_hash)
        if type(result_bytes) is not int or not 0 <= result_bytes <= MAX_RESULT_BYTES:
            raise LedgerError('AGENT_INPUT_INVALID')
        call = _read_call(uow, run_id, generation, call_id)
        if not call or call['state'] != 'reserved':
            raise LedgerError('AGENT_CALL_INVALID')
        if call['tool_id'] == 'blog.read_public':
            if (not isinstance(source, dict)
                    or set(source) != {'article_id', 'title', 'content_hash', 'excerpt_hash'}
                    or type(source['article_id']) is not int or not 0 < source['article_id'] <= 2_147_483_647
                    or not isinstance(source['title'], str) or len(source['title']) > 512):
                raise LedgerError('AGENT_SOURCE_INVALID')
            _hash(source['content_hash'])
            _hash(source['excerpt_hash'])
            source_id = str(uuid4()) if source_id is None else _uuid(source_id)
        elif source is not None or source_id is not None:
            raise LedgerError('AGENT_SOURCE_INVALID')
        updated = uow.execute(
            "UPDATE agent_runs SET result_bytes=result_bytes+%s WHERE id=%s AND generation=%s "
            "AND status='running' AND result_bytes>=0 AND result_bytes+%s<=%s",
            (result_bytes, run_id, generation, result_bytes, MAX_RESULT_BYTES),
        )
        if updated != 1:
            raise LedgerError('AGENT_BUDGET_EXCEEDED')
        updated = uow.execute(
            "UPDATE agent_tool_calls SET state='prepared',result_hash=%s,result_bytes=%s,updated_at=%s "
            "WHERE run_id=%s AND generation=%s AND call_id=%s AND state='reserved'",
            (result_hash, result_bytes, now, run_id, generation, call_id),
        )
        if updated != 1:
            raise LedgerError('AGENT_CALL_INVALID')
        if source is None:
            return None
        uow.execute(
            'INSERT INTO agent_sources '
            '(source_id,run_id,generation,call_id,article_id,title,content_hash,excerpt_hash,delivered,read_at,delivered_at) '
            'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,0,%s,NULL)',
            (source_id, run_id, generation, call_id, source['article_id'], source['title'],
             source['content_hash'], source['excerpt_hash'], now),
        )
        return source_id

    def acknowledge(self, uow, run, *, call_id, result_hash, now):
        run_id, generation = _context(run, now)
        result_hash = _hash(result_hash)
        call = _read_call(uow, run_id, generation, call_id)
        if (not call or call['state'] not in {'prepared', 'delivered'}
                or call['result_hash'] != result_hash):
            raise LedgerError('AGENT_RECEIPT_INVALID')
        source = uow.fetch_one(
            'SELECT * FROM agent_sources WHERE run_id=%s AND generation=%s AND call_id=%s FOR UPDATE',
            (run_id, generation, call_id),
        )
        if ((call['tool_id'] == 'blog.read_public') != bool(source)
                or (source and source['delivered'] != (1 if call['state'] == 'delivered' else 0))):
            raise LedgerError('AGENT_SOURCE_INVALID')
        if call['state'] == 'delivered':
            return True
        updated = uow.execute(
            "UPDATE agent_tool_calls SET state='delivered',updated_at=%s "
            "WHERE run_id=%s AND generation=%s AND call_id=%s AND state='prepared'",
            (now, run_id, generation, call_id),
        )
        if updated != 1:
            raise LedgerError('AGENT_RECEIPT_INVALID')
        if source:
            updated = uow.execute(
                'UPDATE agent_sources SET delivered=1,delivered_at=%s WHERE source_id=%s AND delivered=0',
                (now, source['source_id']),
            )
            if updated != 1:
                raise LedgerError('AGENT_SOURCE_INVALID')
        return True

    def delivered_sources(self, uow, run, source_ids):
        run_id, generation = _context(run, allow_completed=True)
        if not isinstance(source_ids, list) or len(source_ids) > MAX_TOOL_CALLS:
            raise LedgerError('AGENT_SOURCE_INVALID')
        try:
            source_ids = [_uuid(source_id) for source_id in source_ids]
        except LedgerError:
            raise LedgerError('AGENT_SOURCE_INVALID') from None
        if len(set(source_ids)) != len(source_ids):
            raise LedgerError('AGENT_SOURCE_INVALID')
        if not source_ids:
            return []
        placeholders = ', '.join(['%s'] * len(source_ids))
        rows = uow.fetch_all(
            'SELECT * FROM agent_sources WHERE run_id=%s AND generation=%s AND delivered=1 '
            f'AND source_id IN ({placeholders})', (run_id, generation, *source_ids),
        )
        indexed = {row['source_id']: row for row in rows}
        if len(indexed) != len(source_ids):
            raise LedgerError('AGENT_SOURCE_INVALID')
        return [indexed[source_id] for source_id in source_ids]

    def reserve_model(self, uow, run):
        run_id, generation = _context(run)
        updated = uow.execute(
            "UPDATE agent_runs SET model_count=model_count+1 WHERE id=%s AND generation=%s "
            "AND status='running' AND model_count>=0 AND model_count<%s", (run_id, generation, MAX_MODEL_CALLS),
        )
        if updated != 1:
            raise LedgerError('AGENT_BUDGET_EXCEEDED')
        return True

    def fail_tool(self, uow, run, call_id, now):
        run_id, generation = _context(run, now)
        updated = uow.execute(
            "UPDATE agent_tool_calls SET state='failed',error_code='AGENT_TOOL_FAILED',updated_at=%s "
            "WHERE run_id=%s AND generation=%s AND call_id=%s AND state='reserved'",
            (now, run_id, generation, _call_id(call_id)),
        )
        return updated == 1
