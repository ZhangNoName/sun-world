"""The blog module's supported application interface."""

from .repository import BlogPublicRepository
from .service import BlogPublicQueryService


def create_public_queries(metadata_db, content_db, *, policy=None) -> BlogPublicQueryService:
    return BlogPublicQueryService(BlogPublicRepository(metadata_db, content_db), policy)


__all__ = ["BlogPublicQueryService", "create_public_queries", "create_public_tools"]


def create_public_tools(metadata_db, content_db, *, policy=None):
    """Public tool facade; metadata_db may be the caller's current UOW.

    This keeps final citation reads on the existing run connection instead of
    borrowing another pooled MySQL connection while the run row is locked.
    """
    from .tools import BlogPublicTools
    return BlogPublicTools(create_public_queries(metadata_db, content_db, policy=policy))
