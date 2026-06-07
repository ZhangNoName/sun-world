## Current Handoff

- Goal: Implement Phase 4 backend error-code and API contract alignment for Sun World.
- Status: Completed on branch `monorepo-api-import`; pending Codex commit at handoff write time.
- Repo/path: `/home/lighthouse/blog/sun-world`
- Branch: `monorepo-api-import`

## Files Changed

- `apps/api/src/core/response.py`
  - changed `ApiResponse.code` to support `int | str`,
  - allowed `fail()` to receive stable string error codes,
  - updated helper failures to use stable common/auth codes.
- `apps/api/src/type/type.py`
  - aligned legacy `ResponseModel.code` with `int | str`.
- `apps/api/src/type/blog_type.py`
  - added `BlogDetail`, `BlogPage`, and `BlogCreateResult` Pydantic models for OpenAPI response schemas.
- `apps/api/src/routers/blog/blog.py`
  - added `response_model` declarations for blog list/detail/create/delete,
  - used `BLOG_CREATE_FAILED` and `BLOG_NOT_FOUND` stable error codes in failure branches.
- `packages/contracts/openapi.json`
  - regenerated OpenAPI schema.
- `packages/contracts/src/generated-api-types.ts`
  - regenerated TypeScript contracts; blog response envelopes now expose `code: number | string`.
- `apps/web/src/modules/blog/types.ts`
  - consumed generated `operations` and `components` from `@sun-world/contracts`,
  - kept UI-facing view models local to the blog module,
  - kept a form-compatible create payload while exposing `BlogCreateContract`.
- `apps/web/src/modules/blog/composables/useBlogList.ts`
  - hardened mapping for optional generated fields (`id`, `updated_at`, nullable tags).
- `apps/web/src/pages/blog/index.vue`
  - aligned initial detail state with generated contract fields.
- `docs/architecture/api-response-envelope.md`
  - documented stable string error-code support and success semantics.
- `docs/architecture/api-contracts.md`
  - documented current generated-contract consumption and error-code contract.

## Commands Run

- `SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate`
- `git diff --check`
- `bash scripts/check-api.sh`
- `pnpm build:web`
- `pnpm check:web`
- `curl -fsS https://api.sunworld.site/healthz`
- `curl -I --max-time 15 https://sunworld.site`

## Verification

- Contracts generation passed.
- Backend syntax check passed.
- Frontend build passed.
- `pnpm check:web` passed.
- `https://api.sunworld.site/healthz` returned `{"status":"ok"}`.
- `https://sunworld.site` returned HTTP 200.
- Secret scan over source diff found no real secrets; only documentation policy words matched.
- Known warnings:
  - Vite CJS Node API deprecation warning.
  - Element Plus Sass legacy JS API / `if()` deprecation warnings.

## Deployment

- Not deployed.
- No Docker, Nginx, systemd, database, certificate, or secret files were changed.

## Next Step

- Continue adding explicit `response_model=ApiResponse[...]` declarations to non-blog routers so all generated contracts stop falling back to `unknown`.
- Then migrate AI/editor modules to the same `modules/*/api.ts`, `types.ts`, and `errors.ts` pattern.
