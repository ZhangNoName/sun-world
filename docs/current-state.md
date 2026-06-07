# Current State

Last updated: 2026-06-01 (monorepo-api-import branch, Phase 1.5+1 complete)

## Server

- Host: Tencent Cloud Lighthouse
- SSH user: lighthouse
- Public IP: 81.70.43.189
- Project path: /home/lighthouse/blog/sun-world
- Primary branch: main

## Repository Layout

`main` is still the production branch. The migration branch `monorepo-api-import`
contains the monorepo candidate:

```text
sun-world/
  apps/
    web/           # blog frontend (Vue 3 + Vite)
    api/           # FastAPI backend (imported from blog_end)
  packages/
    editor/        # rich text editor library
    icons/         # icon component library
    contracts/     # shared API contracts (planned placeholder)
    db/            # database access layer (planned placeholder, inactive)
  deploy/
    frontend/      # frontend deployment docs
    backend/       # backend deployment docs + systemd example
  scripts/         # verification shell scripts
  docs/            # project and architecture documentation
```

Current production runtime has not been cut over yet:

- Frontend production is still built from `/home/lighthouse/blog/sun-world`.
- Backend production is still running from `/home/lighthouse/blog/blog_end`.
- `apps/api` is present on the migration branch for review and context unification only.

## Services

- Frontend container: my-frontend
- Frontend image: blog-front:latest
- Frontend host port: 8081
- Backend service: uvicorn on port 8000
- Backend source path today: `/home/lighthouse/blog/blog_end`
- Backend monorepo candidate path: `/home/lighthouse/blog/sun-world/apps/api`
- Backend monorepo candidate exposes `/readyz` for dependency readiness; the
  current production backend remains on the legacy path until deliberate cutover.
- Nginx handles HTTPS and proxying.

## Domains

- https://sunworld.site -> frontend container on 127.0.0.1:8081
- https://www.sunworld.site -> frontend container on 127.0.0.1:8081
- https://api.sunworld.site -> backend on 127.0.0.1:8000
- https://shop.sunworld.site -> frontend container on 127.0.0.1:8081

## Automation

`sun-world-auto-deploy.timer` checks and deploys `origin/main` daily at 03:30 CST.

Useful commands:

```bash
sudo systemctl status sun-world-auto-deploy.timer
sudo systemctl start sun-world-auto-deploy.service
sudo tail -100 /var/log/sun-world-auto-deploy.log
```

## Compliance

The homepage must display the ICP filing number:

```text
豫ICP备2024081960号
```

It must link to:

```text
https://beian.miit.gov.cn/
```

The desktop footer is rendered in `apps/web/src/layout/deskLayout.vue` via `ZFooter`.
The mobile filing link is rendered in `apps/web/src/layout/mobLayout.vue`.

## Known Issues

- The production build currently prints TypeScript errors from `packages/editor`, but Vite still exits successfully. Treat this as technical debt; do not assume type-checking is clean.
- Use `docker build --no-cache -t blog-front:latest .` when you need to be certain static assets have been regenerated.
- Sensitive-pattern filename scans report existing frontend and backend files that may contain token/password/API-key related text. Do not print their contents in agent logs. Review and rotate/move any real secrets before merging or cutting over runtime.
