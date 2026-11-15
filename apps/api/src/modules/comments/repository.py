"""Moderated comments. UTC timestamps and all multi-step writes share a transaction."""
from fastapi import HTTPException

from .schemas import BlogComment, CommentPage


class CommentRepository:
    def __init__(self, db):
        self.db = db

    def list(self, *, blog_id=None, status="approved", page=1, page_size=20):
        clauses = ["b.is_deleted = 0"]
        params = []
        if blog_id is not None:
            if not self.db.fetch_one("SELECT id FROM blog WHERE id = %s AND is_deleted = 0", (blog_id,)):
                raise HTTPException(404, "文章不存在")
            clauses.append("c.blog_id = %s")
            params.append(blog_id)
        if status:
            clauses.append("c.status = %s")
            params.append(status)
        where = " AND ".join(clauses)
        source = f"FROM blog_comments c JOIN blog b ON b.id = c.blog_id WHERE {where}"
        count = self.db.fetch_one(f"SELECT COUNT(*) AS total {source}", tuple(params))
        rows = self.db.fetch_all(
            f"SELECT c.id, c.blog_id, c.author_name, c.content, c.status, c.created_at {source} "
            "ORDER BY c.id DESC LIMIT %s OFFSET %s",
            tuple(params + [page_size, (page - 1) * page_size]),
        )
        return CommentPage(items=[BlogComment(**row) for row in rows], total=count["total"], page=page, page_size=page_size)

    def create(self, blog_id, user_id, author_name, content):
        with self.db.unit_of_work() as tx:
            # Serialize submissions by account across API workers before checking the cooldown.
            if not tx.fetch_one("SELECT id FROM users WHERE id = %s FOR UPDATE", (user_id,)):
                raise HTTPException(401, "请重新登录")
            if not tx.fetch_one("SELECT id FROM blog WHERE id = %s AND is_deleted = 0 FOR UPDATE", (blog_id,)):
                raise HTTPException(404, "文章不存在")
            recent = tx.fetch_one(
                "SELECT id FROM blog_comments WHERE user_id = %s "
                "AND created_at > UTC_TIMESTAMP() - INTERVAL 30 SECOND LIMIT 1",
                (user_id,),
            )
            if recent:
                raise HTTPException(429, "评论过于频繁，请等待 30 秒后重试", headers={"Retry-After": "30"})
            comment_id = tx.execute(
                "INSERT INTO blog_comments (blog_id, user_id, author_name, content, status, created_at) "
                "VALUES (%s, %s, %s, %s, 'pending', UTC_TIMESTAMP())",
                (blog_id, user_id, author_name[:128], content),
            )
            row = tx.fetch_one("SELECT * FROM blog_comments WHERE id = %s", (comment_id,))
            tx.commit()
        return BlogComment(**row)

    def review(self, comment_id, status, reviewer_id):
        candidate = self.db.fetch_one("SELECT blog_id FROM blog_comments WHERE id = %s", (comment_id,))
        if not candidate:
            raise HTTPException(404, "评论不存在")
        blog_id = candidate["blog_id"]
        with self.db.unit_of_work() as tx:
            # Always lock blog before comment; the count snapshot starts after this lock.
            if not tx.fetch_one("SELECT id FROM blog WHERE id = %s AND is_deleted = 0 FOR UPDATE", (blog_id,)):
                raise HTTPException(404, "文章不存在")
            row = tx.fetch_one("SELECT * FROM blog_comments WHERE id = %s FOR UPDATE", (comment_id,))
            if row["status"] != status:
                tx.execute(
                    "UPDATE blog_comments SET status = %s, reviewed_by = %s, reviewed_at = UTC_TIMESTAMP() WHERE id = %s",
                    (status, reviewer_id, comment_id),
                )
                # Recompute from the source of truth; retries cannot double-increment the count.
                total = tx.fetch_one(
                    "SELECT COUNT(*) AS total FROM blog_comments WHERE blog_id = %s AND status = 'approved'",
                    (blog_id,),
                )["total"]
                tx.execute("UPDATE blog SET comment_num = %s WHERE id = %s", (total, blog_id))
            tx.commit()
        return BlogComment(**{**row, "status": status})
