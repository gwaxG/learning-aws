# 0003. Three-tier app stack
Date: 2026-10-25
Status: Accepted

## Context
First playground project (`playground/three-tier`): login-protected app, users stored in PostgreSQL, admin dashboards to inspect the DB, a single main screen saying "you are logged in".

## Decision
- **Client:** React (Vite) SPA, static build.
- **Server:** FastAPI + SQLModel, Alembic migrations, JWT bearer auth, passwords hashed with bcrypt, roles `user` / `admin`.
- **Database:** PostgreSQL (RDS in AWS, container locally via docker compose).
- **Admin:** read-only dashboards served by the API under `/api/admin/*` (users, table browser, stats), UI only for `admin` role.
- Deployment architecture and cost: see the next ADR once the estimate is done.

## Consequences
Classic SPA + API + DB split maps to the three tiers. Read-only admin keeps the surface small; schema changes only through Alembic.
