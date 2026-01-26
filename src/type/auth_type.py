from datetime import datetime
from pydantic import BaseModel, EmailStr
from typing import Optional


class RegisterModel(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str]
    password: str


class LoginModel(BaseModel):
    username: Optional[str]
    password: str


class TokenModel(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    access_token_expire: datetime
    refresh_token_expire: datetime


class ResetPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordModel(BaseModel):
    token: str
    new_password: str


class QQModel(BaseModel):
    access_token: str
    expires_in: int
