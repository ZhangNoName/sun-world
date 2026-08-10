import sys
import unittest
from pathlib import Path


API_ROOT = Path(__file__).resolve().parents[1]
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))


class BlogManagerRegressionTests(unittest.TestCase):
    def test_empty_out_of_range_page_preserves_total_count(self):
        from src.controller.blog_manage import BlogManager

        class Db:
            def fetch_all(self, sql, _params):
                if "FROM blog" in sql:
                    return []
                raise AssertionError(sql)

            def fetch_one(self, sql, _params):
                if "COUNT(*)" in sql:
                    return {"count": 12}
                raise AssertionError(sql)

        result = BlogManager(Db(), object()).get_blog_by_page(99, 10)

        self.assertEqual(result["total"], 12)
        self.assertEqual(result["list"], [])

    def test_existing_integer_tag_is_returned_and_bound(self):
        from src.controller.blog_manage import BlogManager

        class Db:
            def __init__(self):
                self.calls = []

            def execute(self, sql, params):
                self.calls.append((sql, params))
                return 1

        db = Db()
        tag_id = BlogManager(db, object()).get_or_create_tag(7, 42)

        self.assertEqual(tag_id, 7)
        self.assertEqual(db.calls[-1][1], (42, 7))

    def test_existing_named_tag_returns_scalar_id(self):
        from src.controller.blog_manage import BlogManager
        from src.type.blog_type import TagNew

        class Db:
            def __init__(self):
                self.bound = None

            def fetch_one(self, *_args):
                return {"id": 9}

            def execute(self, sql, params):
                if "blog_tag" in sql:
                    self.bound = params
                return 1

        db = Db()
        tag_id = BlogManager(db, object()).get_or_create_tag(TagNew(name="Python"), 42)

        self.assertEqual(tag_id, 9)
        self.assertEqual(db.bound, (42, 9))


if __name__ == "__main__":
    unittest.main()
