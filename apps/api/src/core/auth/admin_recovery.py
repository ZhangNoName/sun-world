"""Serialize administrator-reducing writes on one current-read transaction."""

from contextlib import contextmanager


class LastAdministratorError(Exception):
    code = "AUTH_LAST_ADMINISTRATOR"
    message = "必须保留至少一个启用的管理员账号"

    def __init__(self):
        super().__init__(self.message)


def _lock_roles(uow):
    return uow.fetch_all(
        "SELECT id, code FROM roles FORCE INDEX (PRIMARY) ORDER BY id FOR UPDATE"
    )


@contextmanager
def admin_recovery_transaction(db):
    """Commit only if the final state has an enabled administrator.

    Directory row locks serialize participating writers across processes. The
    final READ COMMITTED query also sees this transaction's own changes. There
    is no transaction retry, secondary connection, or process-local mutex.
    """
    with db.unit_of_work(isolation_level="READ COMMITTED") as uow:
        if uow.isolation_level != "READ COMMITTED":
            raise RuntimeError("Administrator recovery requires READ COMMITTED")
        _lock_roles(uow)
        yield uow
        roles = _lock_roles(uow)
        admin_ids = [row["id"] for row in roles
                     if str(row["code"]).strip().lower() == "admin"]
        if not admin_ids:
            raise LastAdministratorError()
        placeholders = ", ".join(["%s"] * len(admin_ids))
        enabled = uow.fetch_one(
            "SELECT 1 AS has_admin FROM users u "
            "INNER JOIN user_roles ur ON ur.user_id = u.id "
            f"WHERE u.status = %s AND ur.role_id IN ({placeholders}) LIMIT 1",
            (1, *admin_ids),
        )
        if not enabled:
            raise LastAdministratorError()
        uow.commit()
