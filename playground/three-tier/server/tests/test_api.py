from .conftest import auth_header, login


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_login_ok_and_me(client):
    h = auth_header(client, "user@example.com", "userpw")
    me = client.get("/api/auth/me", headers=h).json()
    assert me["email"] == "user@example.com" and me["role"] == "user"
    assert "hashed_password" not in me


def test_login_bad_password(client):
    assert login(client, "user@example.com", "nope").status_code == 401


def test_login_unknown_user(client):
    assert login(client, "ghost@example.com", "x").status_code == 401


def test_me_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_admin_forbidden_for_user(client):
    h = auth_header(client, "user@example.com", "userpw")
    assert client.get("/api/admin/users", headers=h).status_code == 403
    assert client.get("/api/admin/stats").status_code == 401


def test_admin_stats_and_users(client):
    login(client, "user@example.com", "wrong")
    h = auth_header(client, "admin@example.com", "adminpw")
    s = client.get("/api/admin/stats", headers=h).json()
    assert s["users_total"] == 2 and s["admins"] == 1
    assert s["failed_logins_24h"] == 1 and s["logins_24h"] == 1
    assert len(client.get("/api/admin/users", headers=h).json()) == 2


def test_admin_tables_mask_secrets(client):
    h = auth_header(client, "admin@example.com", "adminpw")
    names = {t["name"] for t in client.get("/api/admin/tables", headers=h).json()}
    assert names == {"users", "login_events"}
    data = client.get("/api/admin/tables/users", headers=h).json()
    assert data["total"] == 2 and all(r["hashed_password"] == "***" for r in data["rows"])
    assert client.get("/api/admin/tables/nope", headers=h).status_code == 404
