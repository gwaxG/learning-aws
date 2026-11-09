from datetime import datetime

from pydantic import BaseModel, EmailStr

from .models import Role


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: Role
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


class TableInfo(BaseModel):
    name: str
    rows: int
    columns: list[str]


class TableData(BaseModel):
    name: str
    columns: list[str]
    total: int
    limit: int
    offset: int
    rows: list[dict]


class Stats(BaseModel):
    users_total: int
    users_active: int
    admins: int
    logins_24h: int
    failed_logins_24h: int
    recent_events: list[dict]
