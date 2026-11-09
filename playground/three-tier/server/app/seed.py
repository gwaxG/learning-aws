"""Create initial users: `python -m app.seed` (idempotent).

Credentials come from env (SEED_ADMIN_EMAIL/PASSWORD, SEED_USER_EMAIL/PASSWORD) so nothing secret is in code.
"""
import os
import sys

from sqlmodel import Session, select

from .db import engine
from .models import Role, User
from .security import hash_password


def ensure(session: Session, email: str, password: str, name: str, role: Role) -> None:
    email = email.lower()
    if session.exec(select(User).where(User.email == email)).first():
        print(f"exists: {email}")
        return
    session.add(User(email=email, full_name=name, hashed_password=hash_password(password), role=role))
    print(f"created {role.value}: {email}")


def main() -> int:
    admin_pw = os.environ.get("SEED_ADMIN_PASSWORD")
    user_pw = os.environ.get("SEED_USER_PASSWORD")
    if not admin_pw or not user_pw:
        print("Set SEED_ADMIN_PASSWORD and SEED_USER_PASSWORD", file=sys.stderr)
        return 1
    with Session(engine) as session:
        ensure(session, os.environ.get("SEED_ADMIN_EMAIL", "admin@example.com"), admin_pw, "Admin", Role.admin)
        ensure(session, os.environ.get("SEED_USER_EMAIL", "user@example.com"), user_pw, "Demo User", Role.user)
        session.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
