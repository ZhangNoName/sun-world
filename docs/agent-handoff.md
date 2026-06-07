## Current Handoff

- Goal: Implement Phase 3 blog module boundary and error/loading foundation for Sun World.
- Status: Completed on branch `monorepo-api-import`; pending Codex commit at handoff write time.
- Repo/path: `/home/lighthouse/blog/sun-world`
- Branch: `monorepo-api-import`

## Files Changed

- `apps/web/src/app/router/routes.ts`
  - removed `/new_article` from core routes so blog owns article-editor routing.
- `apps/web/src/modules/blog/index.ts`
  - registered `/blog` and `/new_article` with blog-specific route metadata.
- `apps/web/src/modules/blog/api.ts`
  - added typed module API wrappers for blog list, detail, and creation.
- `apps/web/src/modules/blog/types.ts`
  - added `BlogDetail`, `CreateBlogPayload`, and `CreateBlogResponse` types.
- `apps/web/src/modules/blog/errors.ts`
  - added blog-domain error-code checks and user-facing error message mapping.
- `apps/web/src/pages/blog/index.vue`
  - switched to module API/error helpers,
  - added loading skeleton,
  - removed debug logs,
  - improved responsive layout and metadata rendering.
- `apps/web/src/pages/article/index.vue`
  - switched save flow to module `createBlog`,
  - added save-in-progress state and module error messages,
  - improved mobile form layout.
- `apps/web/src/service/http.ts`
  - widened envelope/error code typing to `number | string`,
  - preserved success only for `code === 1` or `code === '1'`,
  - kept `code === 0` as a failure path.
- `apps/web/src/app/router/use-route-loading.ts`
  - added reusable route transition loading state.
- `apps/web/src/main.ts`
  - installed route loading state and provided it to the app.
- `apps/web/src/App.vue`
  - rendered a token-based top route loading bar.
- `docs/architecture/frontend-platform-foundation.md`
  - documented Phase 3 route ownership, module API, error mapping, and route loading.

## Verification

- `git diff --check` - passed.
- `pnpm build:web` - passed.
- `bash scripts/check-api.sh` - passed.
- `pnpm check:web` - passed.
- Public health checks:
  - `https://api.sunworld.site/healthz` - returned `{"status":"ok"}`.
  - `https://sunworld.site` - returned HTTP 200.
- Secret scan over source diff:
  - no real secrets found,
  - matches were documentation policy words such as `secret` and `token`.
- Known warnings:
  - Vite CJS Node API deprecation warning.
  - Element Plus Sass legacy JS API / `if()` deprecation warnings.

## Deployment

- Not deployed.
- No Docker, Nginx, systemd, database, certificate, or secret files were changed.

## Next Step

- Next frontend hardening step: move the physical blog reader/editor page files under `modules/blog/pages/` once the legacy imports are no longer shared.
- Next API contract step: align backend `ApiResponse.code` typing with stable string error codes and regenerate `packages/contracts`.
