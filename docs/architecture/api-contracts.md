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

Use generated types from `@sun-world/contracts`:

```ts
import type { paths, components } from '@sun-world/contracts'
```

The frontend should consume API request/response types. It should not depend on database table schemas.

## Current Consumption

- `apps/web/src/modules/blog/types.ts` imports generated `operations` and `components` from `@sun-world/contracts`.
- Blog module list/detail/create types are derived from generated contract types where OpenAPI exposes a useful schema.
- `apps/web/src/modules/account/types.ts` derives login/register/session/current-user/reset-password types from generated contract operations.
- Account API calls live in `apps/web/src/modules/account/api.ts`; legacy `service/auth.req.ts` and `service/user.req.ts` are compatibility wrappers.
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
