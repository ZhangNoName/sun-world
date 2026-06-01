# Sun World Monorepo Migration Plan

Date: 2026-06-01

## Goal

Unify the Sun World frontend and backend into one product repository so agents and humans can search, reason, document, and review the whole system in one place.

This migration should improve context sharing first. Runtime changes must stay conservative: the frontend container and backend systemd service should continue to run separately until the new layout has been reviewed and deployed deliberately.

## Current State

### Frontend

- Repo: `git@github.com:ZhangNoName/sun-world.git`
- Server path: `/home/lighthouse/blog/sun-world`
- Runtime: Docker container `my-frontend`, host port `8081`
- Domains: `https://sunworld.site`, `https://www.sunworld.site`
- Current shape: pnpm workspace with `apps/web`, `packages/editor`, `packages/icons`

### Backend

- Repo: `git@github.com:ZhangNoName/blog_end.git`
- Server path: `/home/lighthouse/blog/blog_end`
- Runtime: `blog-api.service`, uvicorn on port `8000`
- Domain: `https://api.sunworld.site`
- Current shape: FastAPI + Poetry/pip dependencies, database managers for MySQL, MongoDB, Redis, PostgreSQL

## Target Architecture

Preferred final shape:

```text
sun-world/
  apps/
    web/                 # future home of the blog frontend
    api/                 # FastAPI backend imported from blog_end
  packages/
    editor/              # existing editor package
    icons/               # existing icons package
    contracts/           # future generated OpenAPI/types shared by frontend/backend
    db/                  # future Prisma package only if/when backend moves to TypeScript or a TS data service is introduced
  deploy/
    frontend/
    backend/
  docs/
    architecture/
    current-state.md
    agent-handoff.md
```

Do not introduce Prisma in phase 1. The existing backend is Python/FastAPI and uses handwritten database managers. A Prisma package is useful later if the backend becomes TypeScript-based, or if a separate TypeScript data service is introduced. Until then, `packages/contracts` is more valuable than `packages/db`.

## Migration Strategy

### Phase 1 - Repository Unification, No Runtime Change

Objective: get backend code into the frontend/product repo without breaking production.

Actions:

1. Create a migration branch in `sun-world`: `monorepo-api-import`.
2. Import `blog_end` into `sun-world/apps/api`.
3. Prefer preserving backend Git history with `git subtree add --prefix=apps/api`.
4. Do not delete `/home/lighthouse/blog/blog_end`.
5. Do not change `blog-api.service`.
6. Do not change Nginx.
7. Do not change Docker deployment.
8. Add/update documentation describing the monorepo target and the fact that production still runs from the old backend path.
9. Run narrow verification:
   - `pnpm build:blog` for the frontend.
   - Backend smoke import or health check from the existing service.
   - Public health checks for frontend and backend.

Expected result:

- `sun-world` branch contains `apps/api`.
- Production continues using the already-running `/home/lighthouse/blog/blog_end`.
- Agents can inspect frontend and backend together on the migration branch.

### Phase 1.5 - App Layout Normalization

Objective: make the monorepo directory semantics correct before any runtime cutover.

The current transitional layout has the deployable frontend application under
`packages/blog`. That name is historical. In a cleaner monorepo, deployable
applications belong under `apps/`, while reusable libraries belong under
`packages/`.

Actions:

1. Move the frontend application from `packages/blog` to `apps/web` with `git mv`.
2. Keep the package name `@sun-world/blog` for now to reduce dependency churn.
3. Keep reusable libraries in `packages/`:
   - `packages/editor`
   - `packages/icons`
4. Update root scripts while preserving compatibility aliases:
   - canonical: `dev:web`, `build:web`
   - compatibility: `dev:blog`, `build:blog`
5. Update `Dockerfile` to copy the frontend build from `/app/apps/web/dist`.
6. Update documentation references from `packages/blog` to `apps/web`.
7. Do not move backend runtime or production service paths in this phase.

Expected result:

```text
sun-world/
  apps/
    web/
    api/
  packages/
    editor/
    icons/
```

Verification:

- `pnpm build:web`
- `pnpm build:blog` compatibility alias
- `git diff --check`
- `curl -fsS https://api.sunworld.site/healthz`
- `curl -I https://sunworld.site`

### Phase 2 - Deployment Path Cutover

Objective: make production backend run from `sun-world/apps/api`.

Only after Phase 1 review:

1. Build/recreate backend `.venv` under `apps/api` or standardize an app-local runtime path.
2. Update `blog-api.service` `WorkingDirectory` to `/home/lighthouse/blog/sun-world/apps/api`.
3. Keep secret file path `/home/lighthouse/.config/blog_end/auth.env` initially to avoid secret churn.
4. Restart `blog-api.service`.
5. Verify:
   - `curl -fsS http://127.0.0.1:8000/healthz`
   - `curl -fsS https://api.sunworld.site/healthz`
   - frontend pages still load
6. Keep old `/home/lighthouse/blog/blog_end` as rollback until the new path has been stable.

### Phase 3 - Layout Cleanup

Objective: make the repository shape match the target architecture.

Possible later actions:

1. ~~Move `packages/blog` to `apps/web`.~~ (done in Phase 1.5)
2. ~~Update `pnpm-workspace.yaml`, root scripts, Dockerfile, Vite aliases, and docs.~~ (done in Phase 1.5)
3. Add `packages/contracts` for generated OpenAPI/types.
4. Decide whether to keep Python backend or migrate to TypeScript backend.
5. Introduce `packages/db` with Prisma only if TypeScript backend/data layer becomes real.

## Prisma Decision

Prisma should not be added just because the repo is a monorepo.

Use Prisma if:

- The backend moves to TypeScript, such as NestJS/Fastify/Hono.
- A dedicated TypeScript data service is introduced.
- The project wants schema-first relational database migrations in JS/TS.

Do not use Prisma yet if:

- The backend remains FastAPI/Python.
- MySQL/Mongo/Postgres access remains in existing Python managers.
- The priority is only unified context and deployment organization.

Recommended near-term shared package:

```text
packages/contracts/
  openapi.json
  src/generated-api-types.ts
```

## Safety Rules

- Do not print secrets, env values, tokens, API keys, certificates, private keys, or database passwords.
- Do not commit `.env`, `.venv`, runtime logs, generated caches, or dependency folders.
- Do not use `git reset --hard` or `git push --force`.
- Do not modify running services, Nginx, Docker deployment, databases, or systemd in Phase 1.
- If Git history diverges or the subtree import conflicts, stop and report.

## Review Checklist

- `apps/api` exists and contains the backend source.
- Frontend build still passes.
- Backend public health endpoint still returns ok from the old running service.
- No new tracked secret files are introduced beyond files already tracked in the source repositories.
- Docs clearly state which path production currently uses.
- Migration branch is not merged to `main` until Codex review is complete.
