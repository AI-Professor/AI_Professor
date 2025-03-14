from pydantic import BaseModel, EmailStr
from typing import Optional
from uuid import UUID

class UserCreate(BaseModel):
    first_name: str
    last_name: str
    user_name: str
    university_name: str
    email: str
    password: str

class UserResponse(BaseModel):
    user_id: UUID  # Ensure user_id is of type UUID
    first_name: str
    last_name: str
    user_name: str
    university_name: str
    email: str
    password: str
    major: str
    subscription_tier:str
    role: str

    class Config:
        orm_mode = True


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    last_name: Optional[str] = None
    first_name: Optional[str] = None
    user_name: Optional[str] = None
    university_name: Optional[str] = None
    major: Optional[str] = None

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: str  # Ensure email is always present


class CaptchaBase(BaseModel):
    captcha_id: str
    captcha_text: str


class UserCreateWithCaptcha(UserCreate, CaptchaBase):
    pass


class LoginRequest(BaseModel):
    username: str
    password: str
    captcha_id: str
    captcha_text: str