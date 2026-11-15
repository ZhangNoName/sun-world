"""The blog module's supported application interface."""

from .repository import BlogPublicRepository
from .service import BlogPublicQueryService


def create_public_queries(metadata_db, content_db, *, policy=None) -> BlogPublicQueryService:
    return BlogPublicQueryService(BlogPublicRepository(metadata_db, content_db), policy)


__all__ = ["BlogPublicQueryService", "create_public_queries"]
