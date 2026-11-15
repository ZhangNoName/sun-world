"""Synthetic public articles: no production data or unpublished local drafts."""

from src.modules.blog.public import BlogPublicQueryService
from src.modules.blog.tools import BlogPublicTools
from src.type.blog_type import BlogDetail


DATASET_LABEL = "本地合成文章（3 篇）"


class LocalArticleRepository:
    def __init__(self):
        self.articles = {
            1: BlogDetail(id=1, title="博客问答如何核对来源", abstract="搜索、读取与引用核验。",
                          content="搜索只返回文章标题和摘要。回答引用文章前必须读取正文，记录内容摘要，并在提交答案前重新核对。未找到文章时固定回答未找到相关公开文章。"),
            2: BlogDetail(id=2, title="博客草稿与公开文章的区别", abstract="草稿独立保存，发布需要单独授权。",
                          content="公开博客问答只能读取公开文章。个人草稿独立保存，不进入公开表和静态页面。修改本人草稿需要作者身份，发布需要额外权限与一次确认。"),
            3: BlogDetail(id=3, title="Agent 运行取消与恢复", abstract="持久化运行、取消与重启中断。",
                          content="每次运行使用独立幂等键。取消后拒绝新的工具调用和结果提交。服务重启后未完成运行标记为中断，不会自动重复执行。只读问答不具备发布权限。"),
        }

    def get_blog(self, article_id):
        return self.articles.get(article_id)

    def content_ids(self, ids):
        return set(ids).intersection(self.articles)

    def get_blog_by_page(self, page, page_size, keyword=None, **_kwargs):
        words = (keyword or "").lower().split()
        matches = [a for a in self.articles.values()
                   if not words or any(word in (a.title + a.abstract + a.content).lower() for word in words)]
        start = (page - 1) * page_size
        return {"list": matches[start:start + page_size], "page": page,
                "page_size": page_size, "total": len(matches)}


def create_dataset():
    repository = LocalArticleRepository()
    return repository, BlogPublicTools(BlogPublicQueryService(repository))
