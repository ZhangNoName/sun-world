import sys
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import Mock, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from src.core.auth import AuthorizationDenied, Principal, TargetContext
from src.controller.blog_manage import BlogManager
from src.modules.blog.public import create_public_queries
from src.modules.blog.tools import BlogPublicNotFound, BlogPublicTools


def metadata(article_id=1):
    return dict(id=article_id, title="标题", abstract="摘要", author="作者", category=1,
                created_at=datetime(2026, 1, 1), updated_at=datetime(2026, 1, 1))


class BlogPublicQueriesTests(unittest.TestCase):
    def setUp(self):
        self.db = Mock()
        self.db.fetch_one.return_value = metadata()
        self.db.fetch_all.return_value = []
        self.mongo = MagicMock()
        self.mongo.find_one.return_value = {"blogId": 1, "content": "公开正文"}
        self.mongo.db.__getitem__ = Mock(return_value=Mock())
        self.queries = create_public_queries(self.db, self.mongo)
        self.tools = BlogPublicTools(self.queries)

    def test_reads_use_same_visibility_in_legacy_http_and_tools(self):
        from src.routers.blog.blog import get_blog_manager, router
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_blog_manager] = lambda: BlogManager(self.db, self.mongo)
        client = TestClient(app)
        for row, body, visible in (
            (metadata(), {"content": "正文"}, True),
            (None, {"content": "正文"}, False),
            (metadata(), None, False),
            (metadata(), {}, False),
        ):
            with self.subTest(row=row, body=body):
                self.db.fetch_one.return_value = row
                self.mongo.find_one.return_value = body
                response = client.get("/blogs/1").json()
                if visible:
                    tool = self.tools.read_public(Principal(), {"article_id": 1})
                    self.assertEqual(response["data"]["content"], tool.content)
                else:
                    self.assertIsNone(response["data"])
                    with self.assertRaises(BlogPublicNotFound):
                        self.tools.read_public(Principal(), {"article_id": 1})
        self.db.execute.assert_not_called()
        self.assertIn("COALESCE(is_deleted, 0) = 0", self.db.fetch_one.call_args.args[0])

    def test_search_batches_body_existence_without_refilling_sparse_page(self):
        self.db.fetch_all.side_effect = [[metadata(1), metadata(2)], []]
        self.db.fetch_one.return_value = {"count": 8}
        collection = self.mongo.db["blogs"]
        collection.find.return_value = [{"blogId": 2}]
        result = self.tools.search_public(Principal(), {"query": "  标题  ", "limit": 2})
        self.assertEqual([item.article_id for item in result.items], [2])
        self.assertEqual(self.db.fetch_all.call_args_list[0].args[1], ("%标题%", "%标题%", 2, 0))
        collection.find.assert_called_once_with(
            {"blogId": {"$in": [1, 2]}, "content": {"$type": "string"}},
            {"_id": 0, "blogId": 1},
        )
        self.mongo.find_one.assert_not_called()
        self.assertEqual(self.db.fetch_all.call_count, 2)

    def test_search_reports_truncation_and_bounds_serialized_result(self):
        self.db.fetch_all.side_effect = [
            [{**metadata(i), "title": "\x00" * 600, "abstract": "\x00" * 3000} for i in range(1, 11)],
            [],
        ]
        self.db.fetch_one.return_value = {"count": 10}
        self.mongo.db["blogs"].find.return_value = [{"blogId": i} for i in range(1, 11)]
        result = self.tools.search_public(Principal(), {"query": "x"})
        self.assertTrue(all(item.truncated for item in result.items))
        self.assertLess(len(result.model_dump_json().encode("utf-8")), 64 * 1024)

    def test_content_budget_is_utf8_safe_and_hash_changes_with_title(self):
        self.mongo.find_one.return_value = {"content": "中" * 6000}
        first = self.tools.read_public(Principal(), {"article_id": 1})
        self.assertTrue(first.truncated)
        self.assertEqual(first.content_bytes, 18000)
        self.assertLessEqual(first.returned_bytes, 16384)
        self.assertEqual(first.returned_bytes, len(first.content.encode("utf-8")))
        self.db.fetch_one.return_value = {**metadata(), "title": "新标题"}
        second = self.tools.read_public(Principal(), {"article_id": 1})
        self.assertNotEqual(first.content_hash, second.content_hash)

    def test_direct_service_call_rejects_other_target_before_query(self):
        with self.assertRaises(AuthorizationDenied):
            self.queries.read(Principal(), 1, target=TargetContext(app_id="other"))
        with self.assertRaises(AuthorizationDenied):
            self.queries.read(Principal(kind="service"), 1)
        self.db.fetch_one.assert_not_called()

    def test_tool_identity_and_invalid_inputs_are_rejected_before_query(self):
        for arguments in ({"article_id": 1, "user_id": 9}, {"article_id": True}, {"article_id": "1"}):
            with self.subTest(arguments=arguments), self.assertRaises(ValidationError):
                self.tools.read_public(Principal(), arguments)
        for arguments in ({"query": " "}, {"query": "x", "limit": 11}, {"query": "x", "owner": 1}):
            with self.subTest(arguments=arguments), self.assertRaises(ValidationError):
                self.tools.search_public(Principal(), arguments)
        self.db.fetch_one.assert_not_called()


if __name__ == "__main__":
    unittest.main()
