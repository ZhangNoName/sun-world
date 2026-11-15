"""Public visibility and authorization shared by HTTP and product tools."""

from src.core.auth import PUBLIC_READ, Principal, PublicReadPolicy, TargetContext


class BlogPublicQueryService:
    def __init__(self, repository, policy=None):
        self.repository = repository
        self.policy = policy or PublicReadPolicy()

    def _authorize(self, principal: Principal, target: TargetContext) -> None:
        self.policy.require(principal, PUBLIC_READ, target)

    def read(self, principal: Principal, article_id: int, *, target=TargetContext()):
        self._authorize(principal, target)
        if type(article_id) is not int or article_id <= 0:
            return None
        article = self.repository.get_blog(article_id)
        if article is None or not isinstance(article.content, str):
            return None
        return article

    def list_page(
        self, principal: Principal, page: int, page_size: int, keyword=None,
        sort_by=None, sort_order=None, *, target=TargetContext(),
    ):
        self._authorize(principal, target)
        result = self.repository.get_blog_by_page(
            page, page_size, keyword=keyword, sort_by=sort_by, sort_order=sort_order,
        )
        visible = self.repository.content_ids([article.id for article in result["list"]])
        # Preserve metadata total and page offsets for legacy clients. Missing
        # bodies produce a sparse page, never an unbounded scan to fill it.
        return {**result, "list": [article for article in result["list"] if article.id in visible]}

    def search(self, principal: Principal, query, *, target=TargetContext()):
        return self.list_page(principal, 1, query.limit, query.query, target=target)["list"]
