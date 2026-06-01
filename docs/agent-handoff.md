# Agent Handoff

This file is for short-lived context shared between Codex, Claude Code, and manual server work.
Keep stable rules in AGENTS.md, CLAUDE.md, docs/current-state.md, and docs/engineering-conventions.md.

## Current Handoff

- Goal: Start Sun World monorepo migration by importing the existing backend repository into the frontend/product repository without changing production runtime.
- Status: Ready for Claude Code execution on branch `monorepo-api-import`.
- Scope:
  - Source product repo: `/home/lighthouse/blog/sun-world`
  - Source backend repo: `/home/lighthouse/blog/blog_end` or remote `git@github.com:ZhangNoName/blog_end.git`
  - Target import path: `/home/lighthouse/blog/sun-world/apps/api`
- Architecture plan:
  - Read `docs/architecture/monorepo-migration.md`.
  - Phase 1 only: repository unification, no runtime cutover.
  - Do not introduce Prisma in this phase. Record Prisma as a future `packages/db` option only.
- Implementation plan:
  1. Confirm `/home/lighthouse/blog/sun-world` is on branch `monorepo-api-import`.
  2. Read `AGENTS.md`, `CLAUDE.md`, `docs/current-state.md`, `docs/engineering-conventions.md`, `docs/architecture/monorepo-migration.md`, and this file.
  3. Import backend history into `apps/api`.
     - Preferred: add/fetch a temporary local remote for `blog_end` and run `git subtree add --prefix=apps/api <remote> main -m "chore: import blog backend into monorepo"`.
     - Fallback if `git subtree` is unavailable: report before using a non-history-preserving copy.
  4. Do not move frontend folders yet. Keep `packages/blog`, `packages/editor`, and `packages/icons` working as-is.
  5. Update docs to reflect the migration branch state:
     - `docs/current-state.md`
     - `docs/architecture/monorepo-migration.md` if needed
     - `docs/agent-handoff.md`
     - optionally root `README.md` if a short monorepo overview is useful
  6. If useful, update `pnpm-workspace.yaml` to include `apps/*`, but only if `pnpm build:blog` still works.
  7. Leave production runtime untouched.
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
- Verification:
  - `git status --short --branch`
  - `git diff --check`
  - `pnpm build:blog`
  - `curl -fsS https://api.sunworld.site/healthz`
  - `curl -I https://sunworld.site`
  - File-name-only sensitive pattern scan, without printing values:
    `git grep -IlE "sk-[A-Za-z0-9]|password:|password=|token:|token=|secret:|secret=|api[_-]?key|BEGIN .*KEY" HEAD -- . ":!pnpm-lock.yaml" ":!poetry.lock" || true`
- Handoff back to Codex:
  - Summarize commands run.
  - Report whether `apps/api` import preserved history.
  - Report changed files/paths.
  - Report verification results.
  - Report any sensitive-pattern filenames only, no values.
  - Leave branch unpushed and unmerged for Codex review.
