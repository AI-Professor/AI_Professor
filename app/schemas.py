from pydantic import BaseModel
from typing import Optional
from uuid import UUID

class UserCreate(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    user_id: UUID  # Ensure user_id is of type UUID
    email: str

    class Config:
        orm_mode = True


class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: str  # Ensure email is always present