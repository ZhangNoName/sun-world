# API Response Envelope

Sun World 所有 JSON API 响应统一使用 `{ code, data, msg }` 格式。

All JSON API responses use the unified `{ code, data, msg }` envelope.

## Shape

```json
{
  "code": 1,
  "data": {},
  "msg": "获取成功"
}
```

| Field  | Type               | Description                              |
| ------ | ------------------ | ---------------------------------------- |
| `code` | `int` or `string`  | `1` = business success; otherwise fail. Stable errors use string codes. |
| `data` | `any` or `null`    | Typed business payload, `null` if absent |
| `msg`  | `string`           | Human-readable message                   |

## Rules

- `code === 1` or `code === "1"`: business success — frontend unwraps `data`.
- Any other `code`: business failure — frontend rejects with `ApiError`.
- Stable domain errors should use string codes such as `BLOG_NOT_FOUND`.
- `data` is `null` when no payload (delete, logout, etc.).
- `msg` is always present and human-readable.

## Stable Error Codes

Stable string error codes are the semantic contract between backend failures,
frontend module copy, telemetry, and future admin analytics.

Backend source:

```python
from src.core.error_codes import BLOG_NOT_FOUND, is_error_code_in_namespace
```

Frontend source:

```ts
import {
  BLOG_NOT_FOUND,
  resolveErrorMessage,
  isErrorCodeInNamespace,
} from '@/shared/errors/error-codes'
```

Rules:

- Use namespaces: `COMMON`, `AUTH`, `BLOG`, `AI`, `FILE`, `EDITOR`, `ADMIN`.
- Add every new stable code to backend `ERROR_CODE_NAMESPACES`.
- Add every new stable code to frontend `ERROR_CODE_DETAILS` with default
  message, severity, and retryability.
- Module error files should resolve messages through `resolveErrorMessage()`
  instead of duplicating `switch` statements.
- Global HTTP notifications use the same registry for toast severity.

## Exceptions

The envelope does **not** apply to:

- **SSE / streaming** endpoints (`/ai/chat_stream`, etc.) — these return `StreamingResponse`.
- **File / binary** responses — these return raw file/stream responses.
- **Redirect** responses (e.g. `/` → `/docs`).
- **Operational probes** (`/healthz`, `/readyz`) — these return small raw JSON
  snapshots and use HTTP status codes directly for process/dependency state.

## Backend Usage

### Response Helpers

Import from `src.core.response`:

```python
from src.core.response import ok, fail, not_found, unauthorized

# Success
return ok(data=payload, msg="获取成功")

# Failure
return fail(msg="创建失败", code=BLOG_CREATE_FAILED)
return fail(msg="用户名或密码错误", code=AUTH_LOGIN_FAILED)

# Specialized helpers
return not_found(msg="资源不存在")    # code=COMMON_NOT_FOUND
return unauthorized()                 # code=AUTH_UNAUTHORIZED
```

### ApiResponse Model

```python
class ApiResponse(BaseModel, Generic[T]):
    code: int | str
    data: Optional[T] = None
    msg: str
```

`ResponseModel` in `src/type/type.py` is a backward-compatible alias, also using `msg`.

### Exception Handlers

Global exception handlers in `main.py` ensure uncaught exceptions also return the envelope:

| Exception               | HTTP Status | Envelope                                       |
| ----------------------- | ----------- | ---------------------------------------------- |
| `HTTPException`         | as thrown   | `{ code: status_code, data: null, msg: detail }`|
| `RequestValidationError`| 422         | `{ code: 422, data: [...], msg: "参数校验失败" }`|
| `Exception` (catch-all) | 500         | `{ code: 500, data: null, msg: "服务器内部错误" }`|

## Frontend Usage

### ApiEnvelope and ApiError

```typescript
import type { ApiEnvelope, ApiError } from '@/service/http'

// ApiEnvelope<T> — the raw envelope shape
interface ApiEnvelope<T = unknown> {
  code: number | string
  data: T | null
  msg: string
  message?: string // legacy compatibility
}

// ApiError — thrown on any business or network failure
class ApiError extends Error {
  code: number | string
  msg: string
  status?: number
  payload: unknown
  requestId?: string
}
```

### Interceptor Behavior

The axios response interceptor in `http.ts` handles envelopes automatically:

1. Detects envelope responses by checking for a `code` field.
2. On `code === 1` or `code === "1"`: unwraps `data`, resolves the promise with business data.
3. On any other `code`: resolves display copy through the shared error registry, shows a warning or error toast based on severity, and rejects with `ApiError`.
4. Non-envelope responses pass through as-is.

The error interceptor converts HTTP errors to `ApiError`, preferring the backend `msg` when the error response is also an envelope.
`ApiError.requestId` is populated from `X-Request-ID` when the request went
through the shared HTTP layer, which allows frontend telemetry to be matched to
backend request logs.

### Service Files

Service files use `request.get<T>()` / `request.post<T>()` where `T` is the unwrapped business data type:

```typescript
import { request } from '@/service/http'

const user = await request.get<UserInfo>('/user/me')
// user is UserInfo, not ApiEnvelope<UserInfo>
```

New module APIs should prefer typed helpers from `@/shared/api`, while legacy
service wrappers can keep using `request` during migration.

### Using Contract Types

Prefer types from `@sun-world/contracts` where available:

```typescript
import type { components } from '@sun-world/contracts'
```

## Migration Notes

- Old routers used `ResponseModel(code=1, data=..., message=...)`.
- New routers use `ok(data=..., msg=...)` and `fail(msg=...)`.
- The field `message` was renamed to `msg`. The `ApiEnvelope` type includes an optional `message` for temporary backward compatibility.
- Streaming and file endpoints were not wrapped and remain unchanged.
