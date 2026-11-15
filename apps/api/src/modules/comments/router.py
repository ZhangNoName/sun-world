from fastapi import APIRouter, Depends, HTTPException, Path, Query

from app_instance import app
from src.core.audit_log import audit_log
from src.core.request_context import get_request_id
from src.core.response import ApiResponse, ok
from src.routers.auth.auth import get_current_user, require_admin

from .repository import CommentRepository
from .schemas import BlogComment, CommentInput, CommentPage, CommentReview, CommentStatus

router = APIRouter(tags=["comments"])


def get_comment_repository():
    db = getattr(app, "mysql", None)
    if db is None:
        raise HTTPException(503, "评论服务暂不可用")
    return CommentRepository(db)


def identity(user):
    if isinstance(user, dict):
        return int(user["id"]), str(user.get("name") or "读者")
    return int(user.id), str(getattr(user, "name", None) or "读者")


@router.get("/blogs/{blog_id}/comments", response_model=ApiResponse[CommentPage])
def list_comments(
    blog_id: int = Path(ge=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, alias="pageSize", ge=1, le=100),
    repository=Depends(get_comment_repository),
):
    return ok(data=repository.list(blog_id=blog_id, page=page, page_size=page_size))


@router.post("/blogs/{blog_id}/comments", response_model=ApiResponse[BlogComment], status_code=201)
def create_comment(
    body: CommentInput,
    blog_id: int = Path(ge=1),
    user=Depends(get_current_user),
    repository=Depends(get_comment_repository),
):
    user_id, name = identity(user)
    result = repository.create(blog_id, user_id, name, body.content)
    audit_log.record("comment_submitted", request_id=get_request_id())
    return ok(data=result, msg="评论已提交，审核通过后公开")


@router.get("/admin/comments", response_model=ApiResponse[CommentPage])
def admin_comments(
    status: CommentStatus | None = Query("pending"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, alias="pageSize", ge=1, le=100),
    _user=Depends(require_admin),
    repository=Depends(get_comment_repository),
):
    return ok(data=repository.list(status=status, page=page, page_size=page_size))


@router.put("/admin/comments/{comment_id}", response_model=ApiResponse[BlogComment])
def review_comment(
    body: CommentReview,
    comment_id: int = Path(ge=1),
    user=Depends(require_admin),
    repository=Depends(get_comment_repository),
):
    result = repository.review(comment_id, body.status, identity(user)[0])
    audit_log.record("comment_" + body.status, request_id=get_request_id())
    return ok(data=result)
