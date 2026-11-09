FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:0.4 /uv /usr/local/bin/uv
WORKDIR /srv
COPY pyproject.toml ./
RUN uv sync --no-dev --no-install-project
COPY . .
ENV PATH="/srv/.venv/bin:$PATH" PYTHONUNBUFFERED=1
EXPOSE 8000
# Playground: migrations run on start (see ADR 0004). Seeding is a separate one-off command.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
