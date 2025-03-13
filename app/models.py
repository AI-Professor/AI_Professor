from sqlalchemy import Column, String, TIMESTAMP, JSON, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base
import uuid

class User(Base):
    __tablename__ = "Users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(20))
    last_name = Column(String(20))
    first_name = Column(String(20))
    user_name = Column(String(20))
    subscription_tier = Column(String(20))
    university_name = Column(String(20))
    major = Column(String(20))
    learning_style = Column(JSON)
    learning_goal = Column(ARRAY(String))
    progress = Column(JSON)
    avatars = Column(JSON)
    created_at = Column(TIMESTAMP, server_default=func.now())
    