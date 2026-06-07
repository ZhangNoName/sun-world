## Current Handoff

- Goal: Implement Phase 6 account/user API contract alignment and keep the monorepo web build reproducible.
- Status: Completed and verified locally on branch `monorepo-api-import`; server final verification is pending because the Tencent Cloud instance is currently reachable by ping but SSH/Web requests time out.
- Repo/path: `/home/lighthouse/blog/sun-world` on server, `/Users/zxy/Documents/project/sun-world` locally.
- Branch: `monorepo-api-import`

## Files Changed

- `apps/api/src/type/auth_type.py`
  - added `AuthSession` for login/register/refresh responses.
- `apps/api/src/type/user_type.py`
  - added `UserPublic`, `UserCreateResult`, and `UserPage` response models.
- `apps/api/src/routers/auth/auth.py`
  - added explicit `response_model=ApiResponse[...]` declarations for auth endpoints.
  - returned stable auth error codes for login/register/refresh failures.
- `apps/api/src/routers/user/user.py`
  - added explicit `response_model=ApiResponse[...]` declarations for user endpoints.
  - changed user list response to a pagination envelope.
  - used stable common error codes for user failures.
- `apps/web/src/modules/account/api.ts`
  - centralized login/register/logout/refresh/current-user/reset-password requests.
- `apps/web/src/modules/account/types.ts`
  - derived account/session/current-user/reset-password types from generated OpenAPI operations.
- `apps/web/src/modules/account/errors.ts`
  - centralized account-domain error-code helpers and fallback messages.
- `apps/web/src/modules/account/index.ts`
  - exports account module routes plus API/types/errors.
- `apps/web/src/service/auth.req.ts` and `apps/web/src/service/user.req.ts`
  - kept legacy function names as compatibility wrappers around the account module.
- `apps/web/src/store/auth.ts`
  - made token-expiry handling tolerant of cookie-only access tokens and optional response fields.
- `apps/web/vite.config.ts`
  - made `@sun-world/icons` and `@sun-world/editor` source aliases work in production builds so `pnpm build:web` does not require prebuilt package dist files.
- `packages/contracts/openapi.json`
  - regenerated OpenAPI schema.
- `packages/contracts/src/generated-api-types.ts`
  - regenerated TypeScript contracts; account/user endpoints now expose typed `ApiResponse[...]` schemas instead of `unknown`.
- `docs/architecture/api-contracts.md`
  - documented account contract consumption.

## Commands Run

- `SUN_WORLD_API_PYTHON=/home/lighthouse/blog/blog_end/.venv/bin/python pnpm -F @sun-world/contracts generate`
- `SUN_WORLD_API_PYTHON=/tmp/sun-world-api-venv/bin/python pnpm -F @sun-world/contracts generate`
- `SUN_WORLD_API_PYTHON=/tmp/sun-world-api-venv/bin/python bash scripts/check-api.sh`
- `git diff --check`
- `pnpm build:web`
- `pnpm check:web`
- `ssh -o ConnectTimeout=12 -i ~/.ssh/id_ed25519 lighthouse@81.70.43.189 'echo connected && uptime'`
- `curl -I --max-time 15 https://sunworld.site`
- `curl -fsS --max-time 15 https://api.sunworld.site/healthz`

## Verification

- Contracts generation passed on server before the instance became unresponsive, and passed locally with a temporary Python 3.12 venv.
- Backend syntax check passed locally.
- `git diff --check` passed locally.
- `pnpm build:web` passed locally.
- `pnpm check:web` passed locally.
- Server final verification is pending:
  - SSH currently fails with `Connection timed out during banner exchange`.
  - `https://sunworld.site` currently times out after 15 seconds.
  - `https://api.sunworld.site/healthz` currently times out after 15 seconds.
  - ICMP ping to `81.70.43.189` was previously successful, so the instance likely needs console reboot or load recovery.
- Known warnings:
  - Vite CJS Node API deprecation warning.
  - Element Plus Sass legacy JS API / `if()` deprecation warnings.

## Deployment

- Not deployed.
- No Docker, Nginx, systemd, database, certificate, or secret files were changed.

## Next Step

- After the server is reachable, clear any leftover Vite/pnpm build processes, verify `git status`, sync this commit if needed, and rerun server-side final checks serially.
- Keep production `main` clean and do not deploy this feature branch until the broader refactor is ready.
