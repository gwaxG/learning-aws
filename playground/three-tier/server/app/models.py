from datetime import datetime, timezone
from enum import Enum

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Role(str, Enum):
    user = "user"
    admin = "admin"


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=255)
    full_name: str = Field(max_length=255)
    hashed_password: str = Field(max_length=255)
    role: Role = Field(default=Role.user)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=utcnow)
    last_login_at: datetime | None = Field(default=None)


class LoginEvent(SQLModel, table=True):
    """Audit trail of login attempts; feeds the admin dashboard."""

    __tablename__ = "login_events"

    id: int | None = Field(default=None, primary_key=True)
    email: str = Field(index=True, max_length=255)
    user_id: int | None = Field(default=None, foreign_key="users.id")
    success: bool
    ip: str | None = Field(default=None, max_length=64)
    created_at: datetime = Field(default_factory=utcnow, index=True)
