# Server Resource Policy

The Tencent Cloud Lighthouse server is small: 2 CPU cores and roughly 2GB RAM.
It can host the production services, but it is not a good default place for
heavy agent coding sessions and frontend builds.

## Current Practical Constraint

Running Claude Code plus the DeepSeek API wrapper can consume enough memory to
compete with system services, Git operations, and Node/Python tooling. If pnpm,
Vite, OpenAPI generation, or Docker builds run at the same time, the server may
become slow or start using swap heavily.

## Default Decision

- Prefer local Codex for planning, editing, TypeScript checks, frontend builds,
  and broad repo search.
- Use the server for:
  - GitHub push when local GitHub credentials are unavailable,
  - server-only Python venv checks,
  - production health checks,
  - lightweight branch/status inspection.
- Avoid server-side cc for long multi-file refactors unless the task is small
  and the server is otherwise idle.

## Safe Server Commands

These are usually acceptable:

```bash
git status --short --branch
git log --oneline -5
git switch <branch>
git push origin <branch>
curl -fsS https://api.sunworld.site/healthz
curl -I -fsS https://shop.sunworld.site
SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate
```

Use care with `pnpm check:web`, Vite builds, Docker builds, and cc sessions on
the server. Prefer running those locally.

## When Claude Code Is Still Useful

Use server-side cc only when:

- the change is narrow and mostly text/code edits,
- no production service restart is required,
- no secrets need to be read,
- no long build is expected,
- the task benefits from the server-side context more than it costs in memory.

If cc hangs or produces no output for a long time, stop delegating and let Codex
finish locally.

## Upgrade Signal

Consider upgrading the server if any of these become normal:

- cc/DeepSeek is expected to run interactively every day,
- Docker builds are done on the server often,
- frontend and backend are both built on the server,
- swap usage stays high during ordinary development,
- production latency is affected by agent/tooling work.

A practical development server target would be at least 4GB RAM, and 8GB is
more comfortable if Docker, pnpm, and agent tools run together.
