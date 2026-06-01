# Current State — blog_end Backend

Date: 2026-06-01

## Deployment

| Item | Value |
|------|-------|
| **Host** | lighthouse (local server) |
| **Repo** | `/home/lighthouse/blog/blog_end` |
| **Branch** | `main` |
| **Service** | `blog-api.service` (systemd) |
| **Python** | `.venv/bin/python` (Python 3.12, pip-installed dependencies) |
| **ASGI server** | uvicorn via `start.sh` |
| **Port** | `8000` |
| **Domain** | `api.sunworld.site` (reverse-proxied by Nginx) |
| **Health** | `GET /healthz` → `{"status": "ok"}` |

## Secret Management

- Secret file: `/home/lighthouse/.config/blog_end/auth.env` (do not print or commit values)
- Loaded by `start.sh` at boot via `set -a; . "$SECRET_ENV_FILE"; set +a`
- `BLOG_JWT_SECRET` is required; the app refuses to start without it
- File permissions should be `chmod 600`, owned by the service user

## Databases

| Database | Purpose |
|----------|---------|
| MySQL | User accounts, blog metadata, roles, resources, tags |
| MongoDB | Blog content documents |
| Redis | Auth sessions, caching (key prefix: `blog`) |
| PostgreSQL | LangGraph AI agent checkpointer state |

Config per environment in `src/conf/<env>.yml`.

## Startup Flow

1. systemd starts `blog-api.service`
2. `start.sh` sources the secret env file, sets `ENV`, `PYTHONPATH`, `PORT`
3. uvicorn runs `main:app` on `0.0.0.0:8000`
4. `Application.lifespan` initializes all database connections and managers
5. AI Manager (LangGraph) is initialized asynchronously during lifespan startup

## Service Commands

```bash
# Status
sudo systemctl status blog-api.service

# Restart
sudo systemctl restart blog-api.service

# Logs (last 100 lines)
sudo journalctl -u blog-api.service -n 100 --no-pager

# Follow logs
sudo journalctl -u blog-api.service -f
```

## Health Checks

```bash
# Local
curl -fsS http://127.0.0.1:8000/healthz

# Public
curl -fsS https://api.sunworld.site/healthz
```

## Known State

- Last commit: `f25b24a fix: harden blog api auth and runtime`
- Security hardening pass completed 2026-06-01 (see `docs/security-hardening-plan.md`)
- `.venv` is excluded from Git and was rebuilt on the server with Python 3.12
- No containerization yet (future item in security hardening plan)
- No `/readyz` endpoint yet (future item)
