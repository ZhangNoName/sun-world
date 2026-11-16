"""MySQL lifecycle ledger. Not wired to HTTP, Worker or production admission.

Every method is synchronous and must run on a worker thread. Caller supplies a
currently verified server Principal, never a request/Worker-provided user/family.
AI history uses the SAME connection and commits only with the run transaction.
"""

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from src.core import error_codes
from src.core.auth import Principal
from src.modules.ai.public import AgentHistoryTransactions
from .capacity import LedgerCapacity


TERMINAL = frozenset({'completed', 'failed', 'cancelled', 'interrupted'})
ENGINE = 'dsh-node-0.2.2-rc.1'


class LedgerError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':')).encode()).hexdigest()


def uuid_text(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise LedgerError(error_codes.AGENT_INPUT_INVALID) from None


def family_hash(principal):
    if (principal.kind != 'user' or type(principal.user_id) is not int or principal.user_id <= 0
            or not isinstance(principal.session_family, str) or not principal.session_family
            or len(principal.session_family) > 256):
        raise LedgerError(error_codes.AGENT_ACTIVE_SESSION_REQUIRED)
    return digest([principal.user_id, principal.session_family])


@dataclass(frozen=True)
class Admission:
    run: dict
    created: bool


class MySqlRunLedger:
    def __init__(self, database, *, history=None, clock=None):
        self.database = database
        self.history = history or AgentHistoryTransactions()
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def unit_of_work(self):
        # Each authorization re-read sees newly committed account/role state.
        # No session-wide isolation change leaks to legacy pool borrowers.
        return self.database.unit_of_work(isolation_level='READ COMMITTED')

    def now(self):
        current = self.clock()
        if not isinstance(current, datetime) or current.utcoffset() is None:
            raise LedgerError(error_codes.AGENT_CLOCK_INVALID)
        return current.astimezone(timezone.utc).replace(tzinfo=None)

    def ensure_capacity(self):
        """Read-only advisory check; accept reserves under its own X lock."""
        with self.unit_of_work() as uow:
            LedgerCapacity().check(uow)

    def accept(self, principal: Principal, *, question, idempotency_key, bundle_hash, model_id):
        family = family_hash(principal)
        key = uuid_text(idempotency_key)
        if (not isinstance(question, str) or not question.strip() or len(question) > 2000
                or not isinstance(bundle_hash, str) or not re.fullmatch('[0-9a-f]{64}', bundle_hash)
                or not isinstance(model_id, str) or not model_id.strip() or len(model_id) > 160):
            raise LedgerError(error_codes.AGENT_INPUT_INVALID)
        question = question.strip()
        request_hash = digest({'scenario': 'blog-qa', 'question': question})
        with self.unit_of_work() as uow:
            # User row serializes concurrent idempotency requests from one owner.
            # No retry on unknown commit results; clients query with the same key.
            owner = uow.fetch_one('SELECT id, status FROM users WHERE id = %s FOR UPDATE',
                                  (principal.user_id,))
            if not owner or owner['status'] != 1:
                raise LedgerError(error_codes.AGENT_ACTIVE_SESSION_REQUIRED)
            existing = uow.fetch_one(
                'SELECT * FROM agent_runs WHERE user_id = %s AND scenario = %s '
                'AND idempotency_key = %s FOR UPDATE', (principal.user_id, 'blog-qa', key))
            if existing:
                # A new family must not discover an earlier family's private run.
                if existing['session_family_hash'] != family:
                    raise LedgerError(error_codes.AGENT_RUN_NOT_FOUND)
                if existing.get('history_deleted_at') is not None:
                    raise LedgerError(error_codes.AGENT_HISTORY_DELETED)
                if existing['request_hash'] != request_hash:
                    raise LedgerError(error_codes.AGENT_IDEMPOTENCY_CONFLICT)
                return Admission(existing, False)
            LedgerCapacity().reserve(uow)
            now = self.now()
            run_id = str(uuid4())
            conversation_id = 'agent_conv_' + uuid4().hex
            self.history.create(uow, user_id=principal.user_id, conversation_id=conversation_id,
                                question=question, now=now)
            row = dict(id=run_id, user_id=principal.user_id, app_id='sun-world', scenario='blog-qa',
                       idempotency_key=key, request_hash=request_hash, conversation_id=conversation_id,
                       session_family_hash=family, engine=ENGINE, bundle_hash=bundle_hash,
                       model_id=model_id, status='accepted', generation=1, execution_id=None,
                       root_session_id=None, root_turn_id=None, root_request_id=None, result_hash=None, error_code=None,
                       deadline=now + timedelta(seconds=45), lease_expires_at=None,
                       accepted_at=now, updated_at=now, ended_at=None, tool_count=0, model_count=0,
                       model_input_bytes=0, model_input_tokens_reserved=0,
                       model_output_tokens_reserved=0, model_response_bytes_reserved=0,
                       model_input_tokens_observed=0, model_output_tokens_observed=0,
                       model_response_bytes_observed=0, model_usage_unknown_count=0,
                       result_bytes=0, tool_credential_hash=None, model_credential_hash=None,
                       result_credential_hash=None, history_deleted_at=None)
            columns = ', '.join(row)
            placeholders = ', '.join(['%s'] * len(row))
            uow.execute(f'INSERT INTO agent_runs ({columns}) VALUES ({placeholders})', tuple(row.values()))
            uow.commit()
            return Admission(row, True)

    def get_owned(self, principal, run_id):
        # Trusted lifecycle readers still need terminal identity for cleanup.
        # Public recovery uses _owned's default hidden-history filter instead.
        family = family_hash(principal)
        with self.unit_of_work() as uow:
            row = self._owned(uow, principal.user_id, family, run_id, lock=False, include_deleted=True)
            return row

    def find_request(self, principal, *, question, idempotency_key):
        """Read-only preflight before a Redis reservation; accept rechecks it.

        This read does not grant creation/dispatch permission and cannot replace
        accept's user-row lock and unique constraint.
        """
        family, key = family_hash(principal), uuid_text(idempotency_key)
        if not isinstance(question, str) or not question.strip() or len(question) > 2000:
            raise LedgerError(error_codes.AGENT_INPUT_INVALID)
        request_hash = digest({'scenario': 'blog-qa', 'question': question.strip()})
        with self.unit_of_work() as uow:
            row = uow.fetch_one('SELECT * FROM agent_runs WHERE user_id=%s AND scenario=%s AND idempotency_key=%s',
                                (principal.user_id, 'blog-qa', key))
            if row:
                if row['session_family_hash'] != family:
                    raise LedgerError(error_codes.AGENT_RUN_NOT_FOUND)
                if row.get('history_deleted_at') is not None:
                    raise LedgerError(error_codes.AGENT_HISTORY_DELETED)
                if row['request_hash'] != request_hash:
                    raise LedgerError(error_codes.AGENT_IDEMPOTENCY_CONFLICT)
            return row

    def fail_accepted(self, run_id, *, code):
        """Trusted admission failure only; never rewrites a claimed execution."""
        if code not in {'AGENT_ADMISSION_UNAVAILABLE', 'AGENT_ACTIVE_SESSION_REQUIRED',
                        'AGENT_DISABLED', 'AGENT_RUNTIME_UNAVAILABLE'}:
            raise LedgerError(error_codes.AGENT_INPUT_INVALID)
        with self.unit_of_work() as uow:
            row = uow.fetch_one('SELECT * FROM agent_runs WHERE id=%s FOR UPDATE', (uuid_text(run_id),))
            if not row:
                raise LedgerError(error_codes.AGENT_RUN_NOT_FOUND)
            if row['status'] != 'accepted':
                return row['status']
            now = self.now()
            uow.execute("UPDATE agent_runs SET status='failed',error_code=%s,ended_at=%s,updated_at=%s "
                        "WHERE id=%s AND status='accepted'", (code, now, now, row['id']))
            uow.commit()
            return 'failed'

    @staticmethod
    def _owned(uow, user_id, family, run_id, *, lock=True, include_deleted=False):
        row = uow.fetch_one('SELECT * FROM agent_runs WHERE id = %s AND user_id = %s '
                            'AND session_family_hash = %s' + ('' if include_deleted else ' AND history_deleted_at IS NULL')
                            + (' FOR UPDATE' if lock else ''),
                            (uuid_text(run_id), user_id, family))
        if not row:
            raise LedgerError(error_codes.AGENT_RUN_NOT_FOUND)
        return row

    def erase_history(self, principal, run_id, *, authorize=None):
        family = family_hash(principal)
        with self.unit_of_work() as uow:
            row = self._owned(uow, principal.user_id, family, run_id, include_deleted=True)
            if authorize is not None and authorize(uow, row) is not True:
                raise LedgerError(error_codes.AGENT_ACTIVE_SESSION_REQUIRED)
            if row.get('history_deleted_at') is not None:
                return False
            if row['status'] not in TERMINAL:
                raise LedgerError(error_codes.AGENT_HISTORY_NOT_TERMINAL)
            now = self.now()
            self.history.erase(uow, user_id=row['user_id'], conversation_id=row['conversation_id'], now=now)
            # Receipts live on agent_sources.delivered, not in a separate table.
            for table in ('agent_sources', 'agent_tool_calls', 'agent_model_calls'):
                uow.execute(f'DELETE FROM {table} WHERE run_id=%s', (row['id'],))
            uow.execute('UPDATE agent_runs SET history_deleted_at=%s,updated_at=%s,'
                        'tool_credential_hash=NULL,model_credential_hash=NULL,result_credential_hash=NULL,'
                        'result_hash=NULL,root_session_id=NULL,root_turn_id=NULL,root_request_id=NULL WHERE id=%s',
                        (now, now, row['id']))
            # Current account/session/role state is re-read after destructive
            # work and before commit. A denial rolls back this entire UOW.
            if authorize is not None and authorize(uow, row) is not True:
                raise LedgerError(error_codes.AGENT_ACTIVE_SESSION_REQUIRED)
            uow.commit()
            return True

    def claim(self, run_id, *, execution_id, credential_hashes=None, authorize=None):
        run_id, execution_id = uuid_text(run_id), uuid_text(execution_id)
        hashes = credential_hashes or dict.fromkeys(('tool', 'model', 'result'))
        if (set(hashes) != {'tool', 'model', 'result'} or (credential_hashes is not None and
                any(not isinstance(value, str) or not re.fullmatch('[0-9a-f]{64}', value)
                    for value in hashes.values()))):
            raise LedgerError(error_codes.AGENT_INPUT_INVALID)
        with self.unit_of_work() as uow:
            row = uow.fetch_one('SELECT * FROM agent_runs WHERE id = %s FOR UPDATE', (run_id,))
            now = self.now()
            if (not row or row.get('history_deleted_at') is not None or row['status'] != 'accepted' or row['deadline'] <= now
                    or row['execution_id'] is not None or row['generation'] != 1):
                return None
            if authorize is not None and authorize(uow, row) is not True:
                raise LedgerError(error_codes.AGENT_ACTIVE_SESSION_REQUIRED)
            now = self.now()
            if row['deadline'] <= now:
                raise LedgerError(error_codes.AGENT_EXECUTION_EXPIRED)
            lease = min(now + timedelta(seconds=10), row['deadline'])
            updated = uow.execute(
                "UPDATE agent_runs SET status='running', execution_id=%s, root_session_id=%s, "
                'lease_expires_at=%s, updated_at=%s, tool_credential_hash=%s, model_credential_hash=%s, '
                'result_credential_hash=%s WHERE id=%s AND status=\'accepted\' AND generation=1 '
                'AND execution_id IS NULL AND history_deleted_at IS NULL',
                (execution_id, 'blog-qa-' + run_id, lease, now, hashes['tool'], hashes['model'], hashes['result'], run_id))
            if updated != 1:
                raise LedgerError(error_codes.AGENT_STATE_CONFLICT)
            uow.commit()
            return {**row, 'status': 'running', 'execution_id': execution_id,
                    'root_session_id': 'blog-qa-' + run_id, 'lease_expires_at': lease, 'updated_at': now,
                    **{audience + '_credential_hash': value for audience, value in hashes.items()}}

    @staticmethod
    def _binding(uow, run_id, execution_id, generation):
        if type(generation) is not int or generation != 1:
            raise LedgerError(error_codes.AGENT_EXECUTION_INVALID)
        row = uow.fetch_one('SELECT * FROM agent_runs WHERE id=%s FOR UPDATE', (uuid_text(run_id),))
        if (not row or row['execution_id'] != uuid_text(execution_id) or row['generation'] != generation):
            raise LedgerError(error_codes.AGENT_EXECUTION_INVALID)
        return row

    @staticmethod
    def _live(row, now):
        if (row['status'] != 'running' or row['deadline'] <= now
                or row['lease_expires_at'] is None or row['lease_expires_at'] <= now):
            raise LedgerError(error_codes.AGENT_EXECUTION_EXPIRED)

    def bind_root_turn(self, run_id, *, execution_id, generation, root_turn_id, root_request_id=None, authorize=None):
        if (not isinstance(root_turn_id, str) or not re.fullmatch('[A-Za-z0-9_-]{1,128}', root_turn_id)
                or (root_request_id is not None and (not isinstance(root_request_id, str)
                    or not re.fullmatch('[A-Za-z0-9_-]{1,128}', root_request_id)))):
            raise LedgerError(error_codes.AGENT_EXECUTION_INVALID)
        with self.unit_of_work() as uow:
            row = self._binding(uow, run_id, execution_id, generation)
            if authorize is not None and authorize(uow, row) is not True:
                raise LedgerError(error_codes.AGENT_ACTIVE_SESSION_REQUIRED)
            self._live(row, self.now())
            if ((row['root_turn_id'] is not None and row['root_turn_id'] != root_turn_id)
                    or (row.get('root_request_id') is not None and row['root_request_id'] != root_request_id)):
                raise LedgerError(error_codes.AGENT_EXECUTION_INVALID)
            uow.execute('UPDATE agent_runs SET root_turn_id=%s,root_request_id=%s WHERE id=%s',
                        (root_turn_id, root_request_id, row['id']))
            uow.commit()

    def heartbeat(self, run_id, *, execution_id, generation, authorize=None):
        with self.unit_of_work() as uow:
            row = self._binding(uow, run_id, execution_id, generation)
            if authorize is not None and authorize(uow, row) is not True:
                raise LedgerError(error_codes.AGENT_ACTIVE_SESSION_REQUIRED)
            now = self.now()
            self._live(row, now)
            lease = min(now + timedelta(seconds=10), row['deadline'])
            uow.execute('UPDATE agent_runs SET lease_expires_at=%s, updated_at=%s WHERE id=%s',
                        (lease, now, row['id']))
            uow.commit()
            return lease

    def cancel(self, principal, run_id):
        family = family_hash(principal)
        with self.unit_of_work() as uow:
            row = self._owned(uow, principal.user_id, family, run_id, include_deleted=True)
            if row['status'] in TERMINAL:
                return row['status']
            now = self.now()
            uow.execute("UPDATE agent_runs SET status='cancelled', error_code='AGENT_RUN_CANCELLED', "
                        'ended_at=%s, updated_at=%s WHERE id=%s', (now, now, row['id']))
            uow.commit()
            return 'cancelled'

    def commit_answer(self, run_id, *, execution_id, generation, root_session_id, root_turn_id, prepare, root_request_id=None):
        # The trusted gateway must construct/validate blocks inside this SAME
        # transaction, including current session and delivered/current sources.
        if not callable(prepare):
            raise LedgerError(error_codes.AGENT_OUTPUT_INVALID)
        with self.unit_of_work() as uow:
            row = self._binding(uow, run_id, execution_id, generation)
            if (root_session_id != row['root_session_id'] or not row['root_turn_id']
                    or root_turn_id != row['root_turn_id']
                    or ((row.get('root_request_id') is not None or root_request_id is not None)
                        and row.get('root_request_id') != root_request_id)):
                raise LedgerError(error_codes.AGENT_EXECUTION_INVALID)
            if row['status'] != 'completed':
                self._live(row, self.now())
            blocks = prepare(uow, row)
            if not isinstance(blocks, list) or not blocks or len(blocks) > 16:
                raise LedgerError(error_codes.AGENT_OUTPUT_INVALID)
            try:
                payload = [block.model_dump(mode='json') for block in blocks]
                size = len(json.dumps(payload, ensure_ascii=False).encode())
            except (AttributeError, TypeError, ValueError, UnicodeError):
                raise LedgerError(error_codes.AGENT_OUTPUT_INVALID) from None
            if size > 65536:
                raise LedgerError(error_codes.AGENT_OUTPUT_INVALID)
            result_hash = digest(payload)
            if row['status'] == 'completed':
                if row['result_hash'] == result_hash:
                    return False
                raise LedgerError(error_codes.AGENT_RESULT_CONFLICT)
            now = self.now()
            self._live(row, now)
            self.history.complete(uow, user_id=row['user_id'], conversation_id=row['conversation_id'],
                                  blocks=blocks, now=now)
            now = self.now()
            self._live(row, now)
            changed = uow.execute("UPDATE agent_runs SET status='completed', result_hash=%s, "
                                  'ended_at=%s, updated_at=%s WHERE id=%s AND status=\'running\'',
                                  (result_hash, now, now, row['id']))
            if changed != 1:
                raise LedgerError(error_codes.AGENT_STATE_CONFLICT)
            uow.commit()
            return True

    def end_execution(self, run_id, *, execution_id, generation, status):
        errors = {'failed': 'AGENT_WORKER_FAILED', 'cancelled': 'AGENT_RUN_CANCELLED',
                  'interrupted': 'AGENT_RUN_INTERRUPTED'}
        if not isinstance(status, str) or status not in errors:
            raise LedgerError(error_codes.AGENT_INPUT_INVALID)
        with self.unit_of_work() as uow:
            row = self._binding(uow, run_id, execution_id, generation)
            if row['status'] in TERMINAL:
                return row['status']
            if row['status'] != 'running':
                raise LedgerError(error_codes.AGENT_STATE_CONFLICT)
            now = self.now()
            changed = uow.execute(
                'UPDATE agent_runs SET status=%s,error_code=%s,ended_at=%s,updated_at=%s '
                "WHERE id=%s AND execution_id=%s AND generation=%s AND status='running'",
                (status, errors[status], now, now, row['id'], row['execution_id'], generation))
            if changed != 1:
                raise LedgerError(error_codes.AGENT_STATE_CONFLICT)
            uow.commit()
            return status

    def reconcile(self, *, limit=100):
        if type(limit) is not int or not 1 <= limit <= 100:
            raise LedgerError(error_codes.AGENT_INPUT_INVALID)
        now = self.now()
        with self.unit_of_work() as uow:
            rows = uow.fetch_all("SELECT * FROM agent_runs WHERE (status='accepted' AND deadline<=%s) "
                                 "OR (status='running' AND (deadline<=%s OR lease_expires_at<=%s OR lease_expires_at IS NULL)) "
                                 'ORDER BY deadline, id LIMIT %s FOR UPDATE', (now, now, now, limit))
            for row in rows:
                status = 'failed' if row['status'] == 'accepted' else 'interrupted'
                error = error_codes.AGENT_ACCEPT_EXPIRED if status == 'failed' else error_codes.AGENT_RUN_INTERRUPTED
                uow.execute('UPDATE agent_runs SET status=%s,error_code=%s,ended_at=%s,updated_at=%s '
                            'WHERE id=%s', (status, error, now, now, row['id']))
            uow.commit()
            return [row['id'] for row in rows]
