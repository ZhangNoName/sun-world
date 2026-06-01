# Agent Handoff

This file is for short-lived context shared between Codex, Claude Code, and manual server work.
Keep stable rules in AGENTS.md, CLAUDE.md, docs/current-state.md, and docs/engineering-conventions.md.

## Current Handoff

- Goal: Phase 1.5 monorepo layout normalization — COMPLETE.
- Status: Executed by Claude Code on branch `monorepo-api-import`. Branch is local/unpushed, ready for Codex review.
- Repo/path: `/home/lighthouse/blog/sun-world`

## Execution Summary

### git mv

`git mv packages/blog apps/web` — all 130+ files renamed cleanly with Git history preserved.

### Files Changed

| File | Change |
|------|--------|
| `packages/blog/*` → `apps/web/*` | `git mv` — all source files, config, assets |
| `apps/web/vite.config.ts` | Alias paths: `../icons/src` → `../../packages/icons/src`, `../editor/src` → `../../packages/editor/src` |
| `apps/web/tsconfig.json` | Path aliases: `../editor/src/` → `../../packages/editor/src/`, `../icons/src` → `../../packages/icons/src` |
| `package.json` | Added `dev:web`, `build:web` canonical scripts; `dev:blog`/`build:blog` now delegate to canonical |
| `pnpm-lock.yaml` | Codex ran `pnpm install --lockfile-only` so the workspace importer moved from `packages/blog` to `apps/web` |
| `Dockerfile` | Copy path: `/app/packages/blog/dist` → `/app/apps/web/dist` |
| `tsconfig.json` (root) | `@blog/*` path: `packages/blog/src/*` → `apps/web/src/*` |
| `.gitignore` | `packages/blog/src/constant.ts` → `apps/web/src/constant.ts` |
| `AGENTS.md` | Layout path references updated |
| `docs/current-state.md` | Path references updated |
| `docs/architecture/monorepo-migration.md` | Current shape updated, Phase 3 steps marked done |
| `docs/agent-handoff.md` | This file — rewritten with results |

### Not Changed

- Package name remains `@sun-world/blog` (no dependency churn)
- `pnpm-workspace.yaml` already had `apps/*` — no change needed
- Backend (`apps/api`), Nginx, Docker deployment, systemd, databases, secrets — untouched
- No Prisma introduced

## Verification Results

| Command | Result |
|---------|--------|
| `git status --short --branch` | On `monorepo-api-import`, all renames clean (`R`), modified configs listed (`M`) |
| `git diff --check` | No whitespace errors |
| `pnpm build:web` | ✅ Built in 1m 19s, 2716 modules, dist at `apps/web/dist/` |
| `pnpm build:blog` | ✅ Compatibility alias works (delegates to `build:web`) |
| `pnpm install --lockfile-only` | ✅ Updated `pnpm-lock.yaml` importer from `packages/blog` to `apps/web` |
| `curl -fsS https://api.sunworld.site/healthz` | ✅ `{"status":"ok"}` |
| `curl -I https://sunworld.site` | ✅ `HTTP/2 200` |

### Sensitive Pattern Scan (filenames only)

Sensitive scan reports pre-existing frontend/backend files that contain token/password/API-key-like text. Values were not printed. No new sensitive file class was introduced by this phase, but real secrets should still be removed/rotated before this branch is merged and deployed.

## Target Shape Achieved

```text
sun-world/
  apps/
    web/      ← frontend application (was packages/blog)
    api/      ← backend application
  packages/
    editor/   ← reusable library
    icons/    ← reusable library
```

## Next Steps (for Codex review)

1. Review the diff: `git diff main...monorepo-api-import`
2. If approved, merge to `main`
3. Phase 2: Deployment path cutover for backend (`apps/api`)
