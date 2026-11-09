import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.db import get_session
from app.main import app
from app.models import Role, User
from app.security import hash_password


@pytest.fixture()
def session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(User(email="admin@example.com", full_name="Admin", hashed_password=hash_password("adminpw"), role=Role.admin))
        s.add(User(email="user@example.com", full_name="User", hashed_password=hash_password("userpw")))
        s.commit()
        yield s


@pytest.fixture()
def client(session):
    app.dependency_overrides[get_session] = lambda: session
    yield TestClient(app)
    app.dependency_overrides.clear()


def login(client, email, password):
    return client.post("/api/auth/login", json={"email": email, "password": password})


def auth_header(client, email, password):
    return {"Authorization": f"Bearer {login(client, email, password).json()['access_token']}"}
