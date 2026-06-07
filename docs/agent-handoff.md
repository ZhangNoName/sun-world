## Current Handoff

- Goal: Build the Phase 1 commercial platform foundation for Sun World without deploying it.
- Status: Codex-reviewed implementation ready on branch `monorepo-api-import`.
- Scope:
  - Frontend platform shell, feature module registry, SEO/head management, telemetry adapters.
  - Backend/frontend stable error-code namespaces.
  - Commercial architecture, observability, and analytics documentation.
- Repo/path: `/home/lighthouse/blog/sun-world`
- Branch: `monorepo-api-import`
- Commit: 568c314 feat: 搭建商业化平台基础架构.

## Implementation Summary

- Added frontend platform layers under `apps/web/src/app`, `apps/web/src/shared`, and `apps/web/src/modules`.
- Kept existing pages in place while moving ownership of feature routes into module manifests.
- Preserved compatibility import from `@/router`.
- Added duplicate route-path protection in the router factory.
- Added `@unhead/vue` and `web-vitals` as Phase 1 infrastructure dependencies.
- Added safe route-based document head synchronization for SEO metadata.
- Deferred geolocation/weather side effects until after app mount.
- Added Web Vitals, route timing, and global error-capture hooks with dev-console reporting only.
- Added shared frontend error-code constants and backend `apps/api/src/core/error_codes.py`.
- Added architecture docs:
  - `docs/architecture/commercial-platform-blueprint.md`
  - `docs/architecture/frontend-platform-foundation.md`
  - `docs/architecture/observability-and-analytics.md`

## Verification

- `pnpm install --frozen-lockfile --offline` - passed.
- `pnpm build:web` - passed.
  - Known warnings: Vite CJS API deprecation and Element Plus Sass deprecation warnings.
- `bash scripts/check-api.sh` - passed.
- `curl -fsS https://api.sunworld.site/healthz` - returned `{"status":"ok"}`.
- `curl -I --max-time 15 https://sunworld.site` - returned HTTP 200.
- `git diff --check` - passed.
- Secret scan over source diff - no real secrets found; only documentation policy terms matched.

## Deployment

- Not deployed.
- No Nginx, systemd, database, certificate, or production secret changes were made.
- Keep production worktree on `main` after Codex finalizes the branch so daily auto-deploy remains unaffected.

## Next Step

- Phase 2 should migrate each legacy page into its owning module folder and introduce module-level API clients, store slices, and error mapping.
- Phase 2 can also add a `/admin` analytics/logs information architecture before wiring real metrics storage.
