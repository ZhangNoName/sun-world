"""Minimal server-owned audit references and same-transaction writes."""

from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
import re
from uuid import uuid4

from .admin_recovery import LastAdministratorError, admin_recovery_transaction


ADMIN_AUDIT_ACTIONS = frozenset({
    'user.create', 'user.disable', 'role.create', 'role.update', 'role.delete',
    'role.bind_resources', 'resource.create', 'resource.update', 'resource.delete',
})
MAX_ID = 9_223_372_036_854_775_807
AUDIT_TRANSACTION_TABLES = ('users', 'roles', 'user_roles', 'resources',
                            'role_resources', 'admin_change_audit')


class AdminAuditUnavailableError(Exception):
    code = 'ADMIN_AUDIT_UNAVAILABLE'
    message = '管理变更审计暂不可用，请稍后再试。'

    def __init__(self):
        super().__init__(self.message)


class AdminAuditTargetError(ValueError):
    code = 'ADMIN_AUDIT_TARGET_INVALID'
    message = '管理操作目标格式无效。'

    def __init__(self):
        super().__init__(self.message)


@dataclass(frozen=True)
class AdminAuditContext:
    actor_user_id: int
    session_ref: str
    request_ref: str


def _positive_id(value):
    return type(value) is int and 0 < value <= MAX_ID


def validate_admin_audit_context(context):
    if (type(context) is not AdminAuditContext or not _positive_id(context.actor_user_id)
            or any(type(value) is not str or re.fullmatch('[0-9a-f]{64}', value) is None
                   for value in (context.session_ref, context.request_ref))):
        raise AdminAuditUnavailableError()
    return context


def create_admin_audit_context(*, actor_user_id, session_family_id, request_id=None):
    if (not _positive_id(actor_user_id) or type(session_family_id) is not str
            or not session_family_id.strip() or len(session_family_id) > 128):
        raise AdminAuditUnavailableError()
    if request_id is None or request_id == '':
        request_id = str(uuid4())
    if type(request_id) is not str or not request_id.strip() or len(request_id) > 256:
        raise AdminAuditUnavailableError()
    context = AdminAuditContext(
        actor_user_id,
        sha256(f'{actor_user_id}:{session_family_id}'.encode('utf-8')).hexdigest(),
        sha256(request_id.encode('utf-8')).hexdigest(),
    )
    return validate_admin_audit_context(context)


def admin_audit_target(value):
    """Normalize HTTP user IDs before MySQL can coerce a nonnumeric suffix."""
    if type(value) is str:
        if not value or len(value) > 128 or not value.isascii() or not value.isdigit():
            raise AdminAuditTargetError()
        value = int(value)
    if not _positive_id(value):
        raise AdminAuditTargetError()
    return value


def record_admin_change(uow, audit, *, action, target_id, affected_rows):
    validate_admin_audit_context(audit)
    if (type(action) is not str or action not in ADMIN_AUDIT_ACTIONS or not _positive_id(target_id)
            or type(affected_rows) is not int or not 0 <= affected_rows <= MAX_ID):
        raise AdminAuditUnavailableError()
    try:
        audit_id = uow.execute(
            'INSERT INTO admin_change_audit '
            '(actor_user_id,session_ref,request_ref,action,target_type,target_id,affected_rows,recorded_at) '
            'VALUES (%s,%s,%s,%s,%s,%s,%s,%s)',
            (audit.actor_user_id, audit.session_ref, audit.request_ref, action,
             action.split('.')[0], target_id, affected_rows,
             datetime.now(timezone.utc).replace(tzinfo=None)),
        )
        if not _positive_id(audit_id):
            raise AdminAuditUnavailableError()
    except Exception:
        raise AdminAuditUnavailableError() from None
    return audit_id


def _require_transactional_tables(uow):
    placeholders = ','.join(['%s'] * len(AUDIT_TRANSACTION_TABLES))
    rows = uow.fetch_all(
        'SELECT TABLE_NAME AS table_name, ENGINE AS engine FROM information_schema.TABLES '
        f'WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ({placeholders})',
        AUDIT_TRANSACTION_TABLES,
    )
    if (len(rows) != len(AUDIT_TRANSACTION_TABLES)
            or {row.get('table_name') for row in rows} != set(AUDIT_TRANSACTION_TABLES)
            or any(row.get('engine') != 'InnoDB' for row in rows)):
        raise AdminAuditUnavailableError()


@contextmanager
def admin_audit_transaction(db, audit=None, *, protect_admin=False):
    """No nested borrowing; both business and audit share the commit owner."""
    if audit is not None:
        validate_admin_audit_context(audit)
    try:
        if protect_admin:
            with admin_recovery_transaction(db) as uow:
                if audit is not None:
                    _require_transactional_tables(uow)
                yield uow
        else:
            transaction = (db.unit_of_work(isolation_level='READ COMMITTED')
                           if audit is not None else db.unit_of_work())
            with transaction as uow:
                if audit is not None and uow.isolation_level != 'READ COMMITTED':
                    raise AdminAuditUnavailableError()
                if audit is not None:
                    _require_transactional_tables(uow)
                yield uow
                uow.commit()
    except (LastAdministratorError, AdminAuditTargetError):
        raise
    except Exception:
        if audit is None:
            raise
        raise AdminAuditUnavailableError() from None
