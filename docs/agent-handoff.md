# Agent Handoff

This file is for short-lived context shared between Codex, Claude Code, and manual server work.
Keep stable rules in AGENTS.md, CLAUDE.md, docs/current-state.md, and docs/engineering-conventions.md.

## Execution Summary — API Contracts

- Date: 2026-06-02
- Branch: `monorepo-api-import`
- Goal: Implement the first real `packages/contracts` workflow for OpenAPI export and generated TypeScript API types.
- Status: Complete and ready for review.
- Deployment: Not deployed. No service restart, no Docker, no Nginx, no systemd, no push, no merge.

## Architecture Decision

Prisma was not introduced.

Reason:

- The backend is Python/FastAPI.
- Prisma is a Node/TypeScript database toolkit.
- The frontend should depend on API request/response contracts, not database table schemas.
- The shared package should therefore hold OpenAPI and generated TypeScript API types.

## Implementation Summary

### Added

- `scripts/export-openapi.py`
  - Exports `packages/contracts/openapi.json`.
  - Builds a schema-only FastAPI app and mounts routers.
  - Stubs runtime-only AI objects that would otherwise require credentials at import time.
  - Does not start uvicorn, run lifespan startup, initialize databases, connect to LLM providers, or read secret env files.
- `scripts/generate-openapi.sh`
  - Selects Python in this order:
    1. `SUN_WORLD_API_PYTHON`
    2. `apps/api/.venv/bin/python`
    3. `python3`
- `packages/contracts/openapi.json`
- `packages/contracts/src/generated-api-types.ts`
- `packages/contracts/src/index.ts`
- `docs/architecture/api-contracts.md`

### Updated

- `packages/contracts/package.json`
  - Adds `openapi-typescript`.
  - Adds `generate:openapi`, `generate:types`, `generate`, and `build` scripts.
- `packages/contracts/README.md`
  - Documents API contracts, command usage, Python environment selection, frontend type usage, and Prisma status.
- `README.md`
  - Links to `docs/architecture/api-contracts.md`.
- `pnpm-lock.yaml`
  - Records `openapi-typescript`.

## Important Note

Claude Code was asked to implement this task but stayed in planning/reading for several minutes without file changes. Codex stopped the Claude Code process and implemented the scoped plan directly.

## Verification Results

The final review should run:

```bash
git diff --check
SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts build
pnpm build:web
bash scripts/check-api.sh
curl -fsS https://api.sunworld.site/healthz
curl -I https://sunworld.site
```

Expected generated artifact checks:

```bash
test -s packages/contracts/openapi.json
test -s packages/contracts/src/generated-api-types.ts
test -s packages/contracts/src/index.ts
```

## Current Known Constraint

`apps/api/.venv` does not exist yet on the migration branch. On the current server, use:

```bash
SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate
```

After backend runtime cutover, this should naturally use `apps/api/.venv/bin/python`.

## Next Step

Review and commit this contracts implementation on `monorepo-api-import`, then switch the worktree back to `main` so the daily auto-deploy timer is not affected.
