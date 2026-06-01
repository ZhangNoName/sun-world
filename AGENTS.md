# AGENTS.md — blog_end

## Repository

- **Name**: blog_end
- **Path**: `/home/lighthouse/blog/blog_end`
- **Branch**: `main`
- **Purpose**: Backend API for the sunworld blog. FastAPI application serving REST endpoints for blogs, users, auth, AI, and file management.

## Runtime

- **Language**: Python 3.12
- **Web framework**: FastAPI (uvicorn ASGI server)
- **Package manager**: `pip` in the project `.venv` for the current server deployment; `pyproject.toml`/`poetry.lock` are still present as historical project metadata.
- **Virtual env**: `.venv/` (keep out of Git; `.gitignore` covers it)
- **Entry point**: `main.py` → `app_instance.py` (Application class)
- **Start script**: `./start.sh` — loads secrets, sets `ENV`, `PYTHONPATH`, `PORT`, then execs uvicorn

## Service

- **Service name**: `blog-api.service` (systemd)
- **Port**: `8000`
- **Public domain**: `api.sunworld.site`
- **Health check**: `GET /healthz` → `{"status": "ok"}`
- **Secret file path**: `/home/lighthouse/.config/blog_end/auth.env` (do not read, print, or commit)

## Databases

This app connects to four databases:
- **MySQL** — user, blog metadata, roles, resources, tags
- **MongoDB** — blog content
- **Redis** — auth sessions and caching (key prefix: `blog`)
- **PostgreSQL** — LangGraph AI checkpointer state

Config files live in `src/conf/<env>.yml`.

## Forbidden Operations

- Do not modify `/etc/systemd`, Nginx config, or Docker config.
- Do not modify database schemas or run destructive SQL.
- Do not read, print, or commit the secret file (`/home/lighthouse/.config/blog_end/auth.env`).
- Do not print secrets, tokens, passwords, private keys, certificates, or full env values.
- Do not use `git reset --hard` or `git push --force`.
- If local and remote branches have diverged, stop and report.

## Verification Commands

- `git status --short --branch` — check repo state
- `sudo systemctl status blog-api.service` — check service health
- `curl -fsS http://127.0.0.1:8000/healthz` — local health check
- `curl -fsS https://api.sunworld.site/healthz` — public health check
- `sudo journalctl -u blog-api.service -n 100 --no-pager` — recent service logs

## Documentation

- `README.md` — project overview and deployment commands
- `docs/current-state.md` — current deployment state
- `docs/agent-handoff.md` — active task handoff (task handoff between agents)
- `docs/security-hardening-plan.md` — security hardening plan and follow-ups
