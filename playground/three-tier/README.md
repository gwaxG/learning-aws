# three-tier

React (Vite) + FastAPI + SQLModel + Alembic + PostgreSQL, deployed to AWS with Pulumi.
Decisions and cost: [ADR 0003](../docs/adr/0003-three-tier-app-stack.md), [ADR 0004](../docs/adr/0004-three-tier-aws-architecture-and-cost.md). Pulumi guide: [pulumi.html](../docs/pulumi.html).

```
client/   React SPA: login, "You are logged in" screen, admin dashboards (stats, users, read-only table browser)
server/   FastAPI: /api/auth/login, /api/auth/me, /api/admin/{stats,users,tables}; Alembic migrations; seed script
pulumi/   VPC, RDS, ECR+image, ECS Fargate, ALB, S3, CloudFront (every statement is commented with doc links)
```

Users live in PostgreSQL (`users`, bcrypt hashes). There is no sign-up: users are created with the seed script.
Roles: `user` sees the main screen; `admin` also gets `/admin` (403 for users, 401 without a token).

## Run locally
```bash
docker compose up -d --wait                       # PostgreSQL on :5432
cd server
uv run --python 3.12 alembic upgrade head         # create tables
SEED_ADMIN_PASSWORD=... SEED_USER_PASSWORD=... uv run --python 3.12 python -m app.seed
uv run --python 3.12 uvicorn app.main:app --reload   # http://localhost:8000/docs
cd ../client && npm install && npm run dev        # http://localhost:5173 (proxies /api to :8000)
```
Seeded logins: `admin@example.com` and `user@example.com` with the passwords you passed.

New migration after changing `server/app/models.py`:
`uv run --python 3.12 alembic revision --autogenerate -m "what changed"`.

## Tests
```bash
cd server && uv run --python 3.12 pytest        # API tests on in-memory SQLite
cd pulumi && uv run --python 3.12 pytest        # infrastructure unit tests with Pulumi mocks (no AWS needed)
```

## Deploy to AWS (about $0.09/hour while it exists, ~$65/month; see ADR 0004 and 0005)
Monitoring (CloudWatch dashboard, 6 alarms, Container Insights) is included. Optional config:
`pulumi config set alarmEmail you@example.com` (confirm the SNS email) and `pulumi config set containerInsights false` (saves ~$6/month).

Needs working AWS credentials (`aws sts get-caller-identity`) and Docker running (the image is built by Pulumi).
```bash
cd client && npm install && npm run build         # Pulumi uploads client/dist
cd ../pulumi
pulumi stack init dev
pulumi config set --secret dbPassword "$(openssl rand -base64 24 | tr -d '/+=')"
pulumi config set --secret jwtSecret  "$(openssl rand -base64 48)"
pulumi preview                                    # read the plan
pulumi up
pulumi stack output url
```
Create the users once (the task already ran the migration on start). One-off task reusing the service's task definition:
```bash
aws ecs run-task --cluster $(pulumi stack output cluster) --launch-type FARGATE \
  --task-definition $(pulumi stack output task_definition) \
  --network-configuration "awsvpcConfiguration={subnets=[$(pulumi stack output subnets | jq -r 'join(",")')],securityGroups=[$(pulumi stack output app_security_group)],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"server","command":["python","-m","app.seed"],"environment":[{"name":"SEED_ADMIN_PASSWORD","value":"..."},{"name":"SEED_USER_PASSWORD","value":"..."}]}]}'
```
Watch it in CloudWatch Logs (`pulumi stack output log_group`).

**Tear down when you finish:** `pulumi destroy` (and `pulumi stack rm dev` if you are done with the stack).

## Status
- Server tests (8) and Pulumi mock tests (4) pass; the client builds; the Alembic migration renders valid PostgreSQL SQL.
- Not yet verified end to end: migration/seed/login against a real PostgreSQL and `pulumi preview`/`up` against AWS (Docker Desktop was not running and the default AWS CLI credentials were rejected when this was written).

## Deploy from GitHub Actions
Merging to `main`/`master` redeploys the stack (`.github/workflows/three-tier-deploy.yml`, OIDC to AWS, Pulumi Cloud state). It stays off until you do the one-time setup and set the repo variable `DEPLOY_ENABLED=true`: see [ADR 0006](../docs/adr/0006-github-actions-pulumi-deploy.md).
