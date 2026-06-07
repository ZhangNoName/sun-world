# CLAUDE.md — blog_end

## Read Order

Before making changes in this repo, read in this order:

1. `AGENTS.md` — project contract, forbidden operations, verification commands
2. `docs/current-state.md` — current deployment state (service, port, domain, env)
3. `docs/agent-handoff.md` — active task handoff if present
4. `README.md` — project overview and deployment commands
5. `docs/security-hardening-plan.md` — security hardening status and follow-ups

## Safety Rules

- This is a **production backend** — treat it accordingly.
- Never expose secrets, tokens, passwords, private keys, or full env values in chat, logs, commits, or docs.
- The secret file at `/home/lighthouse/.config/blog_end/auth.env` must never be read, printed, or committed. Reference it by path only.
- Do not modify running services (`blog-api.service`), Nginx, databases, or `/etc/systemd` unless explicitly requested with clear authorization context.
- If git branches have diverged, stop and report instead of force-pushing or resetting.

## Working Conventions

- Match existing code patterns: FastAPI routers in `src/routers/`, controllers in `src/controller/`, database managers in `src/database/`.
- Config lives in `src/conf/<env>.yml` — add new config keys there, not as hardcoded values.
- The app instance is defined in `app_instance.py` as a custom `FastAPI` subclass (`Application`) with lifespan management.
- Virtual env is `.venv/` — use it for the current server deployment. `pyproject.toml`/`poetry.lock` are still present, but the live `.venv` was rebuilt with pip.
- Keep files focused. Split large files at natural boundaries.
- Follow existing naming: PascalCase for classes, snake_case for functions/variables.

## Commands Quick Reference

```bash
# Check service status
sudo systemctl status blog-api.service

# View recent logs
sudo journalctl -u blog-api.service -n 100 --no-pager

# Local health check
curl -fsS http://127.0.0.1:8000/healthz

# Local readiness check
curl -fsS http://127.0.0.1:8000/readyz

# Public health check
curl -fsS https://api.sunworld.site/healthz

# Start locally (dev)
./start.sh

# Import/route smoke check
.venv/bin/python - <<'PY'
from main import app
assert any(route.path == "/healthz" for route in app.routes)
assert any(route.path == "/readyz" for route in app.routes)
print("routes=ok")
PY

# Run tests (if available)
.venv/bin/python -m pytest src/test/ -v
```

## Handoff

- Active multi-step tasks go in `docs/agent-handoff.md`.
- Update handoff before switching agents: record current goal, files changed, commands run, verification results, blockers, and next step.
- Once a handoff task is complete, mark it done and remove the active handoff section.
