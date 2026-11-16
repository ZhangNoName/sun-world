"""Durable model precharge and observed usage; never a guessed tokenizer.

The caller holds the run lock and owns commit/rollback. Output tokens and byte
reservations are never refunded. Only issuer-validated preflight metadata can
authorize counted input; legacy observed usage cannot create that permission.
"""

from uuid import uuid4

from .journal import MAX_MODEL_CALLS, ToolJournal, _context, _hash, _uuid
from .ledger import LedgerError

MAX_INPUT_BYTES = 262144
MAX_OUTPUT_TOKENS_RESERVED = 4096
MAX_RESPONSE_BYTES_RESERVED = 262144
MAX_COUNTER = 2_147_483_647


def _integer(value, maximum):
    if type(value) is not int or not 0 <= value <= maximum:
        raise LedgerError('AGENT_MODEL_USAGE_INVALID')
    return value


def _limits(value):
    from src.modules.ai.public import STRUCTURED_MODEL_LIMITS
    if value is not STRUCTURED_MODEL_LIMITS:
        raise LedgerError('AGENT_INPUT_INVALID')


def model_usage(result, response_bytes, *, limits):
    _limits(limits)
    if (not isinstance(result, dict) or result.get('stop_reason') not in {'end_turn', 'tool_use', 'max_tokens'}
            or not isinstance(result.get('content'), list) or not isinstance(result.get('usage'), dict)
            or set(result['usage']) != {'input_tokens', 'output_tokens'}):
        raise LedgerError('AGENT_MODEL_USAGE_INVALID')
    return dict(input_tokens=_integer(result['usage']['input_tokens'], MAX_COUNTER),
        output_tokens=_integer(result['usage']['output_tokens'], limits.max_output_tokens),
        response_bytes=_integer(response_bytes, limits.max_response_bytes))


def input_metadata_fields(metadata):
    from src.modules.ai.public import MODEL_INPUT_LIMITS, ModelInputMetadata
    if type(metadata) is not ModelInputMetadata:
        raise LedgerError('AGENT_INPUT_INVALID')
    tokens = metadata.input_tokens
    if type(tokens) is not int or not 1 <= tokens <= MODEL_INPUT_LIMITS.max_input_tokens:
        raise LedgerError('AGENT_BUDGET_EXCEEDED')
    return tokens, _hash(metadata.wire_request_hash), _hash(metadata.count_request_hash)


class ModelJournal:
    def reserve(self, uow, run, *, input_bytes, request_hash, now, limits, call_id=None):
        _limits(limits)
        run_id, generation = _context(run, now)
        call_id = _uuid(call_id or str(uuid4()))
        request_hash = _hash(request_hash)
        if type(input_bytes) is not int or not 1 <= input_bytes <= limits.max_request_bytes:
            raise LedgerError('AGENT_BUDGET_EXCEEDED')
        ToolJournal().reserve_model(uow, run)
        updated = uow.execute(
            'UPDATE agent_runs SET model_input_bytes=model_input_bytes+%s,'
            'model_output_tokens_reserved=model_output_tokens_reserved+%s,'
            'model_response_bytes_reserved=model_response_bytes_reserved+%s WHERE id=%s AND generation=%s '
            "AND status='running' AND model_input_bytes>=0 AND model_input_bytes+%s<=%s "
            'AND model_output_tokens_reserved>=0 AND model_output_tokens_reserved+%s<=%s '
            'AND model_response_bytes_reserved>=0 AND model_response_bytes_reserved+%s<=%s',
            (input_bytes, limits.max_output_tokens, limits.max_response_bytes, run_id, generation,
             input_bytes, MAX_INPUT_BYTES, limits.max_output_tokens, MAX_OUTPUT_TOKENS_RESERVED,
             limits.max_response_bytes, MAX_RESPONSE_BYTES_RESERVED))
        if updated != 1:
            raise LedgerError('AGENT_BUDGET_EXCEEDED')
        uow.execute('INSERT INTO agent_model_calls (run_id,generation,call_id,request_hash,input_bytes,'
                    'reserved_output_tokens,reserved_response_bytes,state,reserved_at,updated_at) '
                    "VALUES(%s,%s,%s,%s,%s,%s,%s,'reserved',%s,%s)",
            (run_id, generation, call_id, request_hash, input_bytes,
             limits.max_output_tokens, limits.max_response_bytes, now, now))
        return call_id

    def reserve_input(self, uow, run, call_id, *, metadata, now):
        from src.modules.ai.public import MODEL_INPUT_LIMITS
        run_id, generation = _context(run, now)
        if run['deadline'] <= now:
            raise LedgerError('AGENT_EXECUTION_EXPIRED')
        row = self._call(uow, run, call_id)
        if row['state'] != 'reserved':
            raise LedgerError('AGENT_STATE_CONFLICT')
        values = input_metadata_fields(metadata)
        if row.get('reserved_input_tokens') is not None:
            if values != tuple(row[key] for key in ('reserved_input_tokens', 'wire_request_hash', 'count_request_hash')):
                raise LedgerError('AGENT_MODEL_USAGE_CONFLICT')
            return False
        tokens, wire_hash, count_hash = values
        updated = uow.execute(
            'UPDATE agent_runs SET model_input_tokens_reserved=model_input_tokens_reserved+%s '
            "WHERE id=%s AND generation=%s AND status='running' AND model_input_tokens_reserved>=0 "
            'AND model_input_tokens_reserved+%s<=%s',
            (tokens, run_id, generation, tokens, MODEL_INPUT_LIMITS.max_run_input_tokens))
        if updated != 1:
            raise LedgerError('AGENT_BUDGET_EXCEEDED')
        changed = uow.execute('UPDATE agent_model_calls SET reserved_input_tokens=%s,wire_request_hash=%s,'
            'count_request_hash=%s,input_reserved_at=%s,updated_at=%s '
            'WHERE run_id=%s AND generation=%s AND call_id=%s',
            (tokens, wire_hash, count_hash, now, now, run_id, generation, row['call_id']))
        if changed != 1:
            raise LedgerError('AGENT_STATE_CONFLICT')
        return True

    @staticmethod
    def _call(uow, run, call_id):
        # Metadata can settle after cancel/terminal; it grants no new execution
        # or delivery authority and never changes the run's terminal state.
        run_id, generation = run['id'], run['generation']
        if type(generation) is not int or generation != 1:
            raise LedgerError('AGENT_STATE_CONFLICT')
        row = uow.fetch_one('SELECT * FROM agent_model_calls WHERE run_id=%s AND generation=%s '
                            'AND call_id=%s FOR UPDATE', (_uuid(run_id), generation, _uuid(call_id)))
        if not row or row['state'] not in {'reserved', 'observed', 'unknown'}:
            raise LedgerError('AGENT_STATE_CONFLICT')
        return row

    def observe(self, uow, run, call_id, *, usage, result_hash, now):
        row = self._call(uow, run, call_id)
        _hash(result_hash)
        input_tokens = _integer(usage['input_tokens'], MAX_COUNTER)
        if row.get('reserved_input_tokens') is not None and input_tokens != row['reserved_input_tokens']:
            raise LedgerError('AGENT_MODEL_USAGE_INVALID')
        output_tokens = _integer(usage['output_tokens'], row['reserved_output_tokens'])
        response_bytes = _integer(usage['response_bytes'], row['reserved_response_bytes'])
        values = (input_tokens, output_tokens, response_bytes, result_hash)
        if row['state'] == 'observed':
            if values != tuple(row[key] for key in ('input_tokens', 'output_tokens', 'response_bytes', 'result_hash')):
                raise LedgerError('AGENT_MODEL_USAGE_CONFLICT')
            return False
        if row['state'] != 'reserved':
            raise LedgerError('AGENT_MODEL_USAGE_CONFLICT')
        updated = uow.execute(
            'UPDATE agent_runs SET model_input_tokens_observed=model_input_tokens_observed+%s,'
            'model_output_tokens_observed=model_output_tokens_observed+%s,'
            'model_response_bytes_observed=model_response_bytes_observed+%s WHERE id=%s AND generation=%s '
            'AND model_input_tokens_observed>=0 AND model_input_tokens_observed<=%s '
            'AND model_output_tokens_observed>=0 AND model_output_tokens_observed<=%s '
            'AND model_response_bytes_observed>=0 AND model_response_bytes_observed<=%s',
            (input_tokens, output_tokens, response_bytes, row['run_id'], row['generation'],
             MAX_COUNTER - input_tokens, MAX_OUTPUT_TOKENS_RESERVED - output_tokens,
             MAX_RESPONSE_BYTES_RESERVED - response_bytes))
        if updated != 1:
            raise LedgerError('AGENT_BUDGET_EXCEEDED')
        uow.execute("UPDATE agent_model_calls SET state='observed',input_tokens=%s,output_tokens=%s,"
                    'response_bytes=%s,result_hash=%s,updated_at=%s WHERE run_id=%s AND generation=%s AND call_id=%s',
                    (*values, now, row['run_id'], row['generation'], row['call_id']))
        return True

    def unknown(self, uow, run, call_id, *, now):
        row = self._call(uow, run, call_id)
        if row['state'] != 'reserved':
            return False
        updated = uow.execute('UPDATE agent_runs SET model_usage_unknown_count=model_usage_unknown_count+1 '
            'WHERE id=%s AND generation=%s AND model_usage_unknown_count>=0 AND model_usage_unknown_count<%s',
            (row['run_id'], row['generation'], MAX_MODEL_CALLS))
        if updated != 1:
            raise LedgerError('AGENT_STATE_CONFLICT')
        uow.execute("UPDATE agent_model_calls SET state='unknown',updated_at=%s "
                    'WHERE run_id=%s AND generation=%s AND call_id=%s',
                    (now, row['run_id'], row['generation'], row['call_id']))
        return True
