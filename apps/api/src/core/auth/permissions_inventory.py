"""Aggregate-only legacy authorization inventory; never migrates or grants access."""

from collections import Counter


MAX_DEFINITIONS = 10_000


COUNT_QUERIES = {
    "users": "SELECT COUNT(*) AS count FROM users",
    "roles": "SELECT COUNT(*) AS count FROM roles",
    "resources": "SELECT COUNT(*) AS count FROM resources",
    "user_role_bindings": "SELECT COUNT(*) AS count FROM user_roles",
    "role_resource_bindings": "SELECT COUNT(*) AS count FROM role_resources",
    "dangling_user_role_bindings": """
        SELECT COUNT(*) AS count FROM user_roles ur
        LEFT JOIN users u ON u.id = ur.user_id LEFT JOIN roles r ON r.id = ur.role_id
        WHERE u.id IS NULL OR r.id IS NULL
    """,
    "dangling_role_resource_bindings": """
        SELECT COUNT(*) AS count FROM role_resources rr
        LEFT JOIN roles r ON r.id = rr.role_id LEFT JOIN resources res ON res.id = rr.resource_id
        WHERE r.id IS NULL OR res.id IS NULL
    """,
    "duplicate_user_role_bindings": """
        SELECT COUNT(*) AS count FROM (
            SELECT user_id, role_id FROM user_roles
            GROUP BY user_id, role_id HAVING COUNT(*) > 1
        ) duplicate_bindings
    """,
    "duplicate_role_resource_bindings": """
        SELECT COUNT(*) AS count FROM (
            SELECT role_id, resource_id FROM role_resources
            GROUP BY role_id, resource_id HAVING COUNT(*) > 1
        ) duplicate_bindings
    """,
}


def read_permissions_inventory(cursor):
    """Caller owns a consistent read-only transaction. All output is counts.

    Role normalization uses Python strip/lower, like the legacy admin guard.
    Resource codes are inspected as migration inputs only, never interpreted
    as capability grants.
    Bounded role IDs/codes and resource codes are read internally; only counts
    leave this function. No credential columns, user identifiers, names, contacts
    or resource paths are selected, even for faulty or orphaned rows.
    """
    counts = {}
    for name, query in COUNT_QUERIES.items():
        cursor.execute(query)
        row = cursor.fetchone()
        count = row.get("count") if isinstance(row, dict) else None
        if type(count) is not int or count < 0:
            raise ValueError("Invalid aggregate inventory result")
        counts[name] = count
    definitions = {}
    for table, projection in (("roles", "id, code"), ("resources", "code")):
        cursor.execute(f"SELECT {projection} FROM {table} ORDER BY id LIMIT {MAX_DEFINITIONS + 1}")
        rows = cursor.fetchall()
        if len(rows) > MAX_DEFINITIONS:
            raise ValueError("Too many permission definitions to audit safely")
        # SQL TRIM differs from Python strip for tabs/Unicode whitespace; do not
        # silently undercount an admin accepted by the current legacy guard.
        normalized = [str(row["code"] or "").strip().lower() for row in rows]
        label = "role" if table == "roles" else "resource"
        counts[f"empty_{label}_codes"] = normalized.count("")
        counts[f"duplicate_{label}_codes"] = sum(value > 1 for value in Counter(normalized).values())
        definitions[table] = (rows, normalized)
    roles, normalized = definitions["roles"]
    admin_ids = [row["id"] for row, code in zip(roles, normalized) if code == "admin"]
    if any(type(value) is not int or value <= 0 for value in admin_ids):
        raise ValueError("Invalid role identifier")
    counts["enabled_administrators"] = 0
    if admin_ids:
        placeholders = ", ".join(["%s"] * len(admin_ids))
        cursor.execute(f"""
            SELECT COUNT(DISTINCT u.id) AS count FROM users u
            JOIN user_roles ur ON ur.user_id = u.id WHERE u.status = 1
            AND ur.role_id IN ({placeholders})
        """, tuple(admin_ids))
        row = cursor.fetchone()
        count = row.get("count") if isinstance(row, dict) else None
        if type(count) is not int or count < 0:
            raise ValueError("Invalid administrator aggregate")
        counts["enabled_administrators"] = count
    findings = [name for name in counts if name.startswith(("empty_", "duplicate_", "dangling_")) and counts[name]]
    if counts["enabled_administrators"] == 0:
        findings.append("no_enabled_administrator")
    return {
        "schema_version": 1,
        "counts": counts,
        "findings": findings,
        "administrator_recovery": "unverified",
        "warnings": ["single_enabled_administrator"] if counts["enabled_administrators"] == 1 else [],
    }


def audit_read_only_connection(connection):
    """Use one MySQL snapshot; rollback on success and every failure, never commit."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
            cursor.execute("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY")
            # Nontransactional tables would break the shared snapshot guarantee.
            cursor.execute("""
                SELECT COUNT(*) AS count FROM information_schema.tables
                WHERE table_schema = DATABASE() AND table_name IN
                ('users', 'roles', 'resources', 'user_roles', 'role_resources') AND engine = 'InnoDB'
            """)
            row = cursor.fetchone()
            if not isinstance(row, dict) or row.get("count") != 5:
                raise ValueError("Inventory requires five InnoDB authorization tables")
            return read_permissions_inventory(cursor)
    finally:
        connection.rollback()
