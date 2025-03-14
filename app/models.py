from sqlalchemy import Column, String, TIMESTAMP, JSON, ARRAY
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import declarative_base
import uuid

Base = declarative_base()


class User(Base):
    __tablename__ = "Users"
    __table_args__ = {'extend_existing': True}

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(20), default='Student')
    last_name = Column(String(20))
    first_name = Column(String(20))
    user_name = Column(String(20))
    subscription_tier = Column(String(20), default='Free')
    university_name = Column(String(20))
    major = Column(String(20), default='Undecided')
    learning_style = Column(JSON)
    learning_goal = Column(ARRAY(String))
    progress = Column(JSON)
    avatars = Column(JSON)
    created_at = Column(TIMESTAMP, server_default=func.now())
    