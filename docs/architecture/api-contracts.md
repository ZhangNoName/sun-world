# API Contracts

Sun World uses API contracts, not shared database models, as the boundary between the Python backend and the TypeScript frontend.

## Why API Contracts

The backend is FastAPI/Python, while the frontend is Vue/TypeScript. Prisma is a Node/TypeScript database toolkit, so it is not the right source of truth for the current backend.

The stable shared boundary is:

```text
apps/api
  FastAPI routers
  Pydantic request/response models
  schema-only OpenAPI export

packages/contracts
  openapi.json
  generated TypeScript API types

apps/web
  imports API request/response types
```

This keeps database implementation details inside `apps/api` and gives the frontend the types it actually needs.

## Files

```text
packages/contracts/
  openapi.json
  src/
    api-types.ts
    generated-api-types.ts
    index.ts
```

`openapi.json` is exported from a schema-only FastAPI app that mounts the project routers.
`generated-api-types.ts` is generated from `openapi.json` with `openapi-typescript`.

## Commands

Generate both OpenAPI and TypeScript types:

```bash
pnpm -F @sun-world/contracts generate
```

Generate only OpenAPI:

```bash
pnpm -F @sun-world/contracts generate:openapi
```

Generate only TypeScript types from an existing OpenAPI file:

```bash
pnpm -F @sun-world/contracts generate:types
```

## Python Environment

OpenAPI export imports the FastAPI app, so the selected Python environment must have the backend dependencies installed.

The generator chooses Python in this order:

1. `SUN_WORLD_API_PYTHON`
2. `apps/api/.venv/bin/python`
3. `python3`

On a machine where the API venv has not been created yet, provide the interpreter explicitly:

```bash
SUN_WORLD_API_PYTHON=/path/to/python pnpm -F @sun-world/contracts generate
```

The export script builds a schema-only FastAPI app, mounts the project routers, and stubs runtime-only AI objects that would otherwise require credentials at import time. It does not start uvicorn, run lifespan startup, initialize databases, connect to LLM providers, or read secret env files.

## Frontend Usage

Use generated types and helper types from `@sun-world/contracts`:

```ts
import type {
  ApiRequestBody,
  ApiSuccessData,
  components,
  paths,
} from '@sun-world/contracts'
```

The frontend should consume API request/response types. It should not depend on database table schemas.

## Type Helpers

`packages/contracts/src/api-types.ts` provides stable helper types on top of
the generated OpenAPI output:

- `MethodPath<'get' | 'post' | ...>`: valid paths for a method.
- `ApiRequestBody<Path, Method>`: JSON request body for a path/method.
- `ApiQueryParams<Path, Method>`: typed query parameters.
- `ApiPathParams<Path, Method>`: typed path parameters such as `{ blog_id }`.
- `ApiResponseEnvelope<Path, Method>`: raw `{ code, data, msg }` success
  envelope from the OpenAPI schema.
- `ApiSuccessData<Path, Method>`: successful business data after the frontend
  HTTP interceptor unwraps `envelope.data`.

`ApiSuccessData` removes `null` for endpoints with a real success data schema
and preserves `null` for endpoints that intentionally return no business data.

## Frontend Request Boundary

New module APIs should import request helpers from `@/shared/api` instead of
calling the legacy `@/service/http` wrapper directly:

```ts
import { apiGet, apiPost } from '@/shared/api'

export function fetchBlogPage(page: number, pageSize: number) {
  return apiGet('/blogs/', { query: { page, pageSize } })
}

export function fetchBlogById(blogId: number) {
  return apiGet('/blogs/{blog_id}', { path: { blog_id: blogId } })
}
```

The runtime implementation still delegates to the existing Axios instance, so
cookies, telemetry, envelope unwrapping, and `ApiError` behavior remain
unchanged. The typed helper layer only centralizes path/method/body/query
typing and path-parameter interpolation.

## Current Consumption

- `apps/web/src/modules/blog/types.ts` derives list/detail/create types from
  `ApiSuccessData` and `ApiRequestBody`.
- `apps/web/src/modules/blog/api.ts` uses `apiGet` / `apiPost`, including typed
  query parameters and typed `{ blog_id }` path replacement.
- `apps/web/src/modules/account/types.ts` derives login/register/session/current-user/reset-password types from `ApiSuccessData` and `ApiRequestBody`.
- `apps/web/src/modules/account/api.ts` uses `apiGet` / `apiPost` from the
  shared request boundary.
- `apps/web/src/modules/admin/types.ts` derives request metrics from
  `ApiSuccessData`.
- `apps/web/src/modules/admin/api.ts` uses the shared typed request boundary.
- `apps/web/src/service/baseRequest.ts` imports generated base/category/tag contract types for shared startup data.
- UI-facing view models stay local to the module because they are presentation shapes, not API shapes.
- Legacy `apps/web/src/service/request.ts` remains compatibility glue while new module consumers prefer `modules/*/api.ts`.

## Error-Code Contract

- Success remains numeric `1`.
- Failure codes may be legacy numbers or stable strings.
- New domain errors should prefer stable string constants from backend `apps/api/src/core/error_codes.py` and frontend `apps/web/src/shared/errors/error-codes.ts`.
- `ApiResponse.code` is typed as `int | str` in the backend and `number | string` in the frontend.

## Prisma Status

Prisma remains inactive in this architecture. Reconsider Prisma only if:

- the backend moves to Node/TypeScript,
- a dedicated TypeScript data service is introduced, or
- the project intentionally adopts Prisma for database migrations and accepts the Python integration cost.
