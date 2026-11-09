from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from ..db import get_session
from ..deps import current_user
from ..models import LoginEvent, User
from ..schemas import LoginRequest, TokenResponse, UserOut
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Verified against when the email is unknown, so unknown emails cost the same time as wrong passwords.
_DUMMY_HASH = hash_password("not-a-real-password")


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, session: Session = Depends(get_session)):
    email = body.email.lower()
    user = session.exec(select(User).where(User.email == email)).first()
    ok = verify_password(body.password, user.hashed_password if user else _DUMMY_HASH)
    ok = ok and user is not None and user.is_active

    session.add(
        LoginEvent(
            email=email,
            user_id=user.id if user else None,
            success=ok,
            ip=request.client.host if request.client else None,
        )
    )
    if not ok:
        session.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    user.last_login_at = datetime.now(timezone.utc)
    session.add(user)
    session.commit()
    return TokenResponse(access_token=create_access_token(user.id, user.role.value))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user
