# Agent Handoff

This file is for short-lived context shared between Codex, Claude Code, and manual server work.
Keep stable rules in AGENTS.md, CLAUDE.md, docs/current-state.md, and docs/engineering-conventions.md.

## Current Handoff

- Goal: Normalize frontend/backend API response contracts with a typed `{ code, data, msg }` envelope.
- Status: ✅ DONE — implemented and verified on `monorepo-api-import`.
- Completed by: Claude Code (2026-06-02)

## Completed Work Summary

### Backend

1. **Created `apps/api/src/core/response.py`** — unified response module:
   - `ApiResponse[T]` Pydantic model: `{ code: int, data: Optional[T], msg: str }`
   - `ok(data=None, msg="获取成功")` → code=1
   - `fail(msg="请求失败", data=None, code=0)` → code≠1
   - `not_found(msg="资源不存在")`, `unauthorized(msg="未授权...")`

2. **Updated `apps/api/src/type/type.py`** — `ResponseModel` now uses `msg` (not `message`).

3. **Added global exception handlers in `apps/api/main.py`**:
   - `StarletteHTTPException` → `{ code: status_code, data: null, msg: detail }`
   - `RequestValidationError` → `{ code: 422, data: [...], msg: "参数校验失败" }`
   - `Exception` catch-all → `{ code: 500, data: null, msg: "服务器内部错误" }`

4. **Updated 8 router files** to use `ok()`/`fail()` instead of `ResponseModel(code=..., message=...)`:
   - blog, base, auth, user, role, resource, file, ai
   - Streaming endpoints (ai chat_stream, chat-chunk-stream) left unwrapped.

### Frontend

5. **Refactored `apps/web/src/service/http.ts`**:
   - Added `ApiEnvelope<T>` interface and `ApiError` class.
   - Response interceptor: detects envelope, unwraps `data` on code===1, rejects `ApiError` on code!==1.
   - Error interceptor: converts HTTP errors to `ApiError`, prefers backend `msg`.
   - Simplified `requestHandler`: interceptor handles unwrap/errors now.
   - Exports `request`, `ApiEnvelope`, `ApiError`.

6. **Fixed `apps/web/src/service/request.ts`** — `postSaveBlog` now uses `request.post<any>` (was `ResponseType<any>`).

### Contracts

7. **Regenerated `packages/contracts/`** — OpenAPI and TypeScript types updated.
   - Generated types have `msg` field, no `message` field.

### Docs

8. **Created `docs/architecture/api-response-envelope.md`** — full documentation.

### Verification Results

| Check | Result |
|-------|--------|
| `bash scripts/check-api.sh` | ✅ 69 files compiled OK |
| `pnpm -F @sun-world/contracts build` | ✅ Exported + types generated |
| `pnpm build:web` | ✅ Built in 1m 15s |
| `curl https://api.sunworld.site/healthz` | ✅ `{"status":"ok"}` |
| `curl -I https://sunworld.site` | ✅ HTTP/2 200 |
| `grep "msg" contracts/.../generated-api-types.ts` | ✅ `msg` present |
| `grep "message" contracts/.../generated-api-types.ts` | ✅ No `message` |
| Production runtime | ✅ Untouched |

## Codex Review Follow-Up

- Hardened HTTP exception `detail` handling so non-string details are converted to a safe `msg` string.
- Added centralized frontend `notifyApiError()` so business, HTTP, and network errors are surfaced consistently instead of only warning on 401.

## Next Steps

- Merge `monorepo-api-import` into `main` when ready.
- Deploy backend from monorepo path (see `docs/architecture/deployment-cutover.md`).
- Optionally add `response_model=ResponseModel[...]` to endpoints for richer OpenAPI types.
