# Agent Handoff

This file is for short-lived context shared between Codex, Claude Code, and manual server work.
Keep stable rules in AGENTS.md, CLAUDE.md, docs/current-state.md, and docs/engineering-conventions.md.

## Current Handoff

- Goal: Start Sun World monorepo migration by importing the existing backend repository into the frontend/product repository without changing production runtime.
- Status: Phase 1 imported by Codex after Claude Code blocked on command approval. Not pushed, not merged, production runtime unchanged.
- Scope:
  - Source product repo: `/home/lighthouse/blog/sun-world`
  - Source backend repo: `/home/lighthouse/blog/blog_end` or remote `git@github.com:ZhangNoName/blog_end.git`
  - Target import path: `/home/lighthouse/blog/sun-world/apps/api`
- Architecture plan:
  - Read `docs/architecture/monorepo-migration.md`.
  - Phase 1 only: repository unification, no runtime cutover.
  - Do not introduce Prisma in this phase. Record Prisma as a future `packages/db` option only.
## Phase 1 Result

- Branch: `monorepo-api-import`
- Commits:
  - `4daf9cb docs: plan monorepo migration`
  - `d286b4b chore: import blog backend into monorepo`
- Backend import:
  - Imported from local remote `/home/lighthouse/blog/blog_end`
  - Target path: `apps/api`
  - Method: `git subtree add --prefix=apps/api blog_end_import main`
  - Backend history is preserved through subtree history.
- Production runtime:
  - Unchanged. Backend still runs from `/home/lighthouse/blog/blog_end`.
  - No systemd, Nginx, Docker, database, or secret files were changed.
- Prisma:
  - Not introduced. Keep as a future `packages/db` option only if a TypeScript backend/data service becomes real.
- Allowed commands:
  - `git status --short --branch`
  - `git remote -v`, `git remote add`, `git fetch`
  - `git subtree add --prefix=apps/api ...`
  - `find`, `sed -n`, `git grep -IlE`
  - `pnpm build:blog`
  - `curl -fsS https://api.sunworld.site/healthz`
  - `curl -I https://sunworld.site`
  - `git diff --check`
- Forbidden commands:
  - Do not change or restart `blog-api.service`.
  - Do not change Nginx.
  - Do not rebuild/restart Docker.
  - Do not remove `/home/lighthouse/blog/blog_end`.
  - Do not push, merge, rebase, force-push, or delete branches.
  - Do not use `git reset --hard`.
  - Do not print secrets, env values, tokens, API keys, private keys, certificates, or database passwords.
  - Do not add Prisma dependencies or create a real Prisma schema in this phase.
## Verification To Complete

- `git diff --check`
- `pnpm build:blog`
- `curl -fsS https://api.sunworld.site/healthz`
- `curl -I https://sunworld.site`
- File-name-only sensitive pattern scan, without printing values:
  `git grep -IlE "sk-[A-Za-z0-9]|password:|password=|token:|token=|secret:|secret=|api[_-]?key|BEGIN .*KEY" HEAD -- . ":!pnpm-lock.yaml" ":!poetry.lock" || true`

## Review Notes

- The branch should remain local/unpushed until Codex review completes.
- Before merging to `main`, decide how to handle existing tracked frontend `.env*` files and backend config files that may contain sensitive-looking text.
- Phase 2 should cut over `blog-api.service` to `apps/api` only after this branch is reviewed and merged.
