"""Thin adapters; identity is injected by the gateway, never tool arguments."""

import hashlib
import json

from src.core.auth import Principal, TargetContext
from .schemas import (
    BlogReadPublicInput, BlogReadPublicOutput,
    BlogSearchPublicInput, BlogSearchPublicOutput,
)


MAX_CONTENT_BYTES = 16 * 1024


class BlogPublicNotFound(LookupError):
    pass


class BlogPublicTools:
    def __init__(self, queries):
        self.queries = queries

    def search_public(self, principal: Principal, arguments: dict, *, target=TargetContext()):
        query = BlogSearchPublicInput.model_validate(arguments)
        articles = self.queries.search(principal, query, target=target)
        return BlogSearchPublicOutput(items=[
            {
                "article_id": article.id, "title": article.title[:128],
                "abstract": article.abstract[:512],
                "truncated": len(article.title) > 128 or len(article.abstract) > 512,
            }
            for article in articles
        ])

    def read_public(self, principal: Principal, arguments: dict, *, target=TargetContext()):
        query = BlogReadPublicInput.model_validate(arguments)
        article = self.queries.read(principal, query.article_id, target=target)
        if article is None:
            raise BlogPublicNotFound("Public article not found")
        raw = article.content.encode("utf-8")
        excerpt = raw[:MAX_CONTENT_BYTES].decode("utf-8", errors="ignore")
        canonical = json.dumps(
            {"article_id": article.id, "title": article.title, "content": article.content},
            ensure_ascii=False, sort_keys=True, separators=(",", ":"),
        ).encode("utf-8")
        return BlogReadPublicOutput(
            article_id=article.id, title=article.title[:512], content=excerpt,
            content_hash=hashlib.sha256(canonical).hexdigest(),
            truncated=len(raw) > MAX_CONTENT_BYTES, content_bytes=len(raw),
            returned_bytes=len(excerpt.encode("utf-8")),
        )
