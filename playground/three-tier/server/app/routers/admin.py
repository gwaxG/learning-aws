from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, SQLModel, col, select

from ..db import get_session
from ..deps import admin_user
from ..models import LoginEvent, Role, User
from ..schemas import Stats, TableData, TableInfo, UserOut

router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(admin_user)])

SECRET_MARKERS = ("password", "secret", "token")


def _is_secret(column: str) -> bool:
    return any(marker in column for marker in SECRET_MARKERS)


def _cell(key: str, value):
    if _is_secret(key):
        return "***"
    if isinstance(value, datetime):
        return value.isoformat()
    return getattr(value, "value", value)  # enums -> plain value


@router.get("/stats", response_model=Stats)
def stats(session: Session = Depends(get_session)):
    since = datetime.now(timezone.utc) - timedelta(hours=24)

    users_total = session.exec(select(func.count()).select_from(User)).one()
    users_active = session.exec(select(func.count()).select_from(User).where(col(User.is_active))).one()
    admins = session.exec(select(func.count()).select_from(User).where(User.role == Role.admin)).one()
    logins = session.exec(
        select(func.count()).select_from(LoginEvent).where(LoginEvent.created_at >= since, col(LoginEvent.success))
    ).one()
    failed = session.exec(
        select(func.count()).select_from(LoginEvent).where(LoginEvent.created_at >= since, ~col(LoginEvent.success))
    ).one()
    events = session.exec(select(LoginEvent).order_by(col(LoginEvent.id).desc()).limit(10)).all()
    return Stats(
        users_total=users_total,
        users_active=users_active,
        admins=admins,
        logins_24h=logins,
        failed_logins_24h=failed,
        recent_events=[
            {"id": e.id, "email": e.email, "success": e.success, "ip": e.ip, "created_at": e.created_at.isoformat()}
            for e in events
        ],
    )


@router.get("/users", response_model=list[UserOut])
def users(session: Session = Depends(get_session)):
    return session.exec(select(User).order_by(col(User.id))).all()


@router.get("/tables", response_model=list[TableInfo])
def list_tables(session: Session = Depends(get_session)):
    out = []
    for name, table in sorted(SQLModel.metadata.tables.items()):
        total = session.exec(select(func.count()).select_from(table)).one()
        out.append(TableInfo(name=name, rows=total, columns=[c.name for c in table.columns]))
    return out


@router.get("/tables/{name}", response_model=TableData)
def table_rows(
    name: str,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    session: Session = Depends(get_session),
):
    table = SQLModel.metadata.tables.get(name)  # whitelist: only tables known to the models
    if table is None:
        raise HTTPException(404, "Unknown table")
    total = session.exec(select(func.count()).select_from(table)).one()
    stmt = select(table).order_by(*table.primary_key.columns).limit(limit).offset(offset)
    rows = [{k: _cell(k, v) for k, v in row.items()} for row in session.connection().execute(stmt).mappings()]
    return TableData(
        name=name, columns=[c.name for c in table.columns], total=total, limit=limit, offset=offset, rows=rows
    )
