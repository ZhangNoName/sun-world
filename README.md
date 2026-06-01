# blog_end

博客后端 — FastAPI backend for the sunworld blog.

## Quick Start

```bash
./start.sh
```

The server listens on `http://0.0.0.0:8000`. Health check at `/healthz`.

## Deployment

The backend runs as a systemd service behind Nginx.

| Item | Detail |
|------|--------|
| Service | `blog-api.service` |
| Port | `8000` |
| Domain | `api.sunworld.site` |
| Secret file | `/home/lighthouse/.config/blog_end/auth.env` |

### Service Commands

```bash
sudo systemctl status blog-api.service       # check status
sudo systemctl restart blog-api.service      # restart
sudo journalctl -u blog-api.service -n 100 --no-pager  # recent logs
curl -fsS http://127.0.0.1:8000/healthz      # local health
curl -fsS https://api.sunworld.site/healthz  # public health
```

### Documentation

- `docs/current-state.md` — current deployment state
- `docs/agent-handoff.md` — task handoff between agents
- `docs/security-hardening-plan.md` — security hardening status
- `AGENTS.md` — project contract and forbidden operations
- `CLAUDE.md` — how Claude Code works in this repo
