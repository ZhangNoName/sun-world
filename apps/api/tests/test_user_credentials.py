import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class UserCredentialBoundaryTests(unittest.TestCase):
    def test_general_user_queries_never_select_password(self):
        from src.controller.user_manage import UserManager

        class Db:
            def __init__(self):
                self.sql = []

            def fetch_one(self, sql, *_args):
                self.sql.append(sql)
                return {"id": 1, "status": 1}

            def fetch_all(self, sql, *_args):
                self.sql.append(sql)
                return []

            def execute(self, sql, *_args):
                self.sql.append(sql)
                return []

        db = Db()
        manager = UserManager(db)
        manager.get_user_by_id(1)
        manager.get_user_by_name("", 1, 10)
        manager.get_user_by_email("", 1, 10)

        user_selects = [sql for sql in db.sql if "FROM users" in sql]
        self.assertEqual(len(user_selects), 3)
        for sql in user_selects:
            with self.subTest(sql=sql):
                selected_columns = sql.split("FROM users", 1)[0].lower()
                self.assertNotIn("password", selected_columns)

    def test_login_query_is_the_only_query_that_selects_password(self):
        from src.controller.user_manage import UserManager

        class Db:
            def __init__(self):
                self.sql = ""

            def fetch_all(self, sql, _params):
                self.sql = sql
                return []

        db = Db()
        UserManager(db).get_user_by_login_identifier("admin")

        self.assertIn("password", db.sql.split("FROM users", 1)[0].lower())


if __name__ == "__main__":
    unittest.main()
