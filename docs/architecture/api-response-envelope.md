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
| `code` | `int`              | `1` = business success; otherwise fail   |
| `data` | `any` or `null`    | Typed business payload, `null` if absent |
| `msg`  | `string`           | Human-readable message                   |

## Rules

- `code === 1`: business success — frontend unwraps `data`.
- `code !== 1`: business failure — frontend rejects with `ApiError`.
- `data` is `null` when no payload (delete, logout, etc.).
- `msg` is always present and human-readable.

## Exceptions

The envelope does **not** apply to:

- **SSE / streaming** endpoints (`/ai/chat_stream`, etc.) — these return `StreamingResponse`.
- **File / binary** responses — these return raw file/stream responses.
- **Redirect** responses (e.g. `/` → `/docs`).

## Backend Usage

### Response Helpers

Import from `src.core.response`:

```python
from src.core.response import ok, fail, not_found, unauthorized

# Success
return ok(data=payload, msg="获取成功")

# Failure
return fail(msg="创建失败")
return fail(msg="用户名或密码错误", code=0)

# Specialized helpers
return not_found(msg="资源不存在")    # code=0
return unauthorized()                 # code=401, msg="未授权，请重新登录"
```

### ApiResponse Model

```python
class ApiResponse(BaseModel, Generic[T]):
    code: int
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
  code: number
  data: T | null
  msg: string
  message?: string // legacy compatibility
}

// ApiError — thrown on any business or network failure
class ApiError extends Error {
  code: number
  msg: string
  status?: number
  payload: unknown
}
```

### Interceptor Behavior

The axios response interceptor in `http.ts` handles envelopes automatically:

1. Detects envelope responses by checking for a `code` field.
2. On `code === 1`: unwraps `data`, resolves the promise with business data.
3. On `code !== 1`: shows an error message (for 401), rejects with `ApiError`.
4. Non-envelope responses pass through as-is.

The error interceptor converts HTTP errors to `ApiError`, preferring the backend `msg` when the error response is also an envelope.

### Service Files

Service files use `request.get<T>()` / `request.post<T>()` where `T` is the unwrapped business data type:

```typescript
import { request } from '@/service/http'

const user = await request.get<UserInfo>('/user/me')
// user is UserInfo, not ApiEnvelope<UserInfo>
```

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
