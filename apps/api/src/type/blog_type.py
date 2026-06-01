from datetime import datetime
from typing import List, Optional, Union
import uuid
from pydantic import BaseModel, Field

class Category(BaseModel):
    id: int = Field(..., description="分类 ID")
    name: str = Field(..., description="分类名称")


class Blog(BaseModel):
    id: int = Field(default_factory=lambda: str(uuid.uuid4()), description="博客的唯一标识符")
    title: str = Field(..., description="博客标题")
    content: str = Field(..., description="博客内容")
    author: Optional[str] = Field(default="zxy", description="作者")
    created_at: datetime = Field(default_factory=datetime.now, description="创建时间")
    updated_at: datetime = Field(default_factory=datetime.now, description="更新时间")



class TagExisting(BaseModel):
    id: int = Field(..., description="已有标签的 ID")

class TagNew(BaseModel):
    name: str = Field(..., description="新增标签的名称")
    
class BlogCreate(Blog):
    id: Optional[int] = Field(None, description="博客的唯一标识符")
    abstract: str = Field(..., description="文章摘要")
    tag: List[Union[int, TagNew]] = Field(..., description="文章标签（可以是已有标签ID或新增标签）")
    category: int = Field(..., description="分类")

class BlogBase(BaseModel):
    id: int = Field(default_factory=lambda: str(uuid.uuid4()), description="博客的唯一标识符")
    title: str = Field(..., description="博客标题")
    author: Optional[str] = Field(default="zxy", description="作者")
    updated_at: datetime = Field(default_factory=datetime.now, description="更新时间")
    abstract: str = Field(..., description="文章摘要")
    view_num: int = Field(0, description="浏览次数")
    comment_num: int = Field(0, description="评论次数")
    byte_num: int = Field(0, description="评论次数")
    tag: Optional[List[int]] = Field([], description="标签")
    category: Optional[int] = Field(None, description="分类")