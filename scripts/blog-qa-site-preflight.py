"""Read-only local connection/account inventory. Never print configuration secrets."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api"))


def main():
    from app_instance import app
    from src.database.mysql.mysql_manage import MySQLManager
    app.load_config("local")
    c = app.config["mysql"]
    db = MySQLManager(host=c["ip"], port=c["port"], db=c["db"], user=c["user"],
                      password=c["password"], pool_size=1)
    ids = [int(row["id"]) for row in db.fetch_all("""
        SELECT DISTINCT u.id FROM users u
        JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
        WHERE u.status=1 AND LOWER(TRIM(r.code))='admin'
    """)]
    if not ids:
        raise RuntimeError("No enabled administrator account exists")
    # Only ids of existing accounts are returned, never account names/contacts.
    print(json.dumps({"allowed_ids": ids, "public_articles": db.fetch_one(
        "SELECT COUNT(*) AS count FROM blog WHERE COALESCE(is_deleted,0)=0")["count"]}))


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print("Local site preflight failed; check local API configuration.", file=sys.stderr)
        sys.exit(1)
