import sqlite3
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class SqliteDb:
    """Execute repository SQL against a real transaction with a minimal MySQL dialect adapter."""
    def __init__(self):
        self.conn = sqlite3.connect(':memory:', check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript('''
            CREATE TABLE users(id INTEGER PRIMARY KEY);
            CREATE TABLE blog(id INTEGER PRIMARY KEY, is_deleted INTEGER DEFAULT 0, comment_num INTEGER DEFAULT 0);
            CREATE TABLE blog_comments(id INTEGER PRIMARY KEY AUTOINCREMENT, blog_id INTEGER, user_id INTEGER,
              author_name TEXT, content TEXT, status TEXT, created_at TEXT, reviewed_by INTEGER, reviewed_at TEXT);
            INSERT INTO users VALUES(1);
            INSERT INTO blog(id) VALUES(1);
        ''')

    def query(self, sql, params):
        sql = sql.replace(' FOR UPDATE', '').replace('%s', '?')
        sql = sql.replace('UTC_TIMESTAMP() - INTERVAL 30 SECOND', "datetime('now', '-30 seconds')")
        sql = sql.replace('UTC_TIMESTAMP()', "datetime('now')")
        return self.conn.execute(sql, params)

    def fetch_one(self, sql, params=()):
        row = self.query(sql, params).fetchone()
        return dict(row) if row else None

    def fetch_all(self, sql, params=()):
        return [dict(row) for row in self.query(sql, params).fetchall()]

    def execute(self, sql, params=()):
        cursor = self.query(sql, params)
        return cursor.lastrowid if sql.startswith('INSERT') else cursor.rowcount

    def unit_of_work(self):
        return self

    def __enter__(self):
        return self

    def commit(self):
        self.conn.commit()

    def __exit__(self, *args):
        self.conn.rollback()


class CommentsTests(unittest.TestCase):
    def setUp(self):
        from src.modules.comments.router import router, get_comment_repository
        from src.modules.comments.repository import CommentRepository
        from src.routers.auth.auth import get_current_user
        self.db = SqliteDb()
        self.app = FastAPI()
        self.app.include_router(router)
        self.user = {'id': 1, 'name': 'Reader', 'roles': [{'code': 'admin'}]}
        self.app.dependency_overrides[get_current_user] = lambda: self.user
        self.app.dependency_overrides[get_comment_repository] = lambda: CommentRepository(self.db)
        self.client = TestClient(self.app)
        self.audit = patch('src.modules.comments.router.audit_log.record').start()
        self.addCleanup(patch.stopall)
        self.addCleanup(self.db.conn.close)

    def submit(self, content='First comment'):
        return self.client.post('/blogs/1/comments', json={'content': content})

    def test_moderation_visibility_and_idempotent_count(self):
        result = self.submit('<script>alert(1)</script>')
        self.assertEqual(result.status_code, 201)
        comment = result.json()['data']
        self.assertEqual(comment['status'], 'pending')
        self.assertEqual(self.client.get('/blogs/1/comments').json()['data']['total'], 0)
        self.assertEqual(self.client.get('/admin/comments').json()['data']['total'], 1)
        path = f"/admin/comments/{comment['id']}"
        for _ in range(2):
            self.assertEqual(self.client.put(path, json={'status': 'approved'}).status_code, 200)
        self.assertEqual(self.db.fetch_one('SELECT comment_num FROM blog')['comment_num'], 1)
        public = self.client.get('/blogs/1/comments').json()['data']['items'][0]
        self.assertNotIn('user_id', public)
        self.assertNotIn('reviewed_by', public)
        self.assertEqual(public['content'], '<script>alert(1)</script>')
        self.assertEqual(self.client.put(path, json={'status': 'rejected'}).status_code, 200)
        self.assertEqual(self.db.fetch_one('SELECT comment_num FROM blog')['comment_num'], 0)
        self.assertEqual(self.client.get('/blogs/1/comments').json()['data']['total'], 0)
        self.assertNotIn('<script>', str(self.audit.call_args_list))

    def test_validation_cooldown_and_auth(self):
        for content in ['', '   ', 'x' * 2001]:
            self.assertEqual(self.submit(content).status_code, 422)
        self.assertEqual(self.submit().status_code, 201)
        second = self.submit()
        self.assertEqual(second.status_code, 429)
        self.assertEqual(second.headers['retry-after'], '30')
        self.user['roles'] = []
        self.assertEqual(self.client.get('/admin/comments').status_code, 403)
        self.assertEqual(self.client.put('/admin/comments/1', json={'status': 'approved'}).status_code, 403)
        self.assertEqual(self.client.get('/blogs/1/comments?pageSize=101').status_code, 422)
        self.assertEqual(self.client.get('/blogs/1/comments?status=pending').json()['data']['total'], 0)

    def test_missing_and_deleted_article(self):
        self.assertEqual(self.client.post('/blogs/99/comments', json={'content': 'test'}).status_code, 404)
        self.assertEqual(self.client.get('/blogs/99/comments').status_code, 404)
        self.submit()
        self.db.execute('UPDATE blog SET is_deleted = 1')
        self.db.commit()
        self.assertEqual(self.client.put('/admin/comments/1', json={'status': 'approved'}).status_code, 404)
        self.assertEqual(self.client.get('/admin/comments').json()['data']['total'], 0)

    def test_counter_failure_rolls_back_review(self):
        self.submit()
        original = self.db.execute
        def fail_count(sql, params=()):
            if sql.startswith('UPDATE blog SET comment_num'):
                raise RuntimeError('db unavailable')
            return original(sql, params)
        with patch.object(self.db, 'execute', side_effect=fail_count):
            with self.assertRaises(RuntimeError):
                self.client.put('/admin/comments/1', json={'status': 'approved'})
        self.assertEqual(self.client.get('/admin/comments').json()['data']['total'], 1)

    def test_guest_cannot_submit(self):
        from src.routers.auth.auth import get_current_user
        from fastapi import HTTPException
        def guest():
            raise HTTPException(401, 'Login required')
        self.app.dependency_overrides[get_current_user] = guest
        self.assertEqual(self.submit().status_code, 401)
        self.assertEqual(self.client.get('/blogs/1/comments').status_code, 200)
