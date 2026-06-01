
from pydantic import BaseModel, Field

class TagBase(BaseModel):
    id: int = Field(..., description="标签 ID")
    name: str = Field(..., description="标签名称")
    
class TagCreate(BaseModel):
    name: str = Field(..., description="标签名称")
    
    
    