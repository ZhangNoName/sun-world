# @sun-world/contracts

共享 API 契约包。用于存放前端和后端之间的 OpenAPI 规范与生成的 TypeScript 类型。

Shared API contracts package. Houses the OpenAPI specification and generated TypeScript types shared by the frontend and backend.

## Purpose

当前后端是 Python/FastAPI，前端是 Vue/TypeScript。因此共享层应该是 **API 契约**，不是数据库模型或 Prisma schema。

The backend is Python/FastAPI and the frontend is Vue/TypeScript. The shared layer should therefore be the **API contract**, not database models or a Prisma schema.

```text
apps/api
  FastAPI + Pydantic
  schema-only OpenAPI export

packages/contracts
  openapi.json
  src/generated-api-types.ts

apps/web
  imports API request/response types
```

## Files

```text
packages/contracts/
├── openapi.json
├── package.json
├── src/
│   ├── generated-api-types.ts
│   └── index.ts
└── README.md
```

## Commands

Generate OpenAPI and TypeScript types:

```bash
pnpm -F @sun-world/contracts generate
```

Generate only OpenAPI:

```bash
pnpm -F @sun-world/contracts generate:openapi
```

This command is cross-platform and uses `scripts/generate-openapi.mjs` instead
of a shell-specific wrapper.

Generate only TypeScript types from `openapi.json`:

```bash
pnpm -F @sun-world/contracts generate:types
```

## Python Environment

OpenAPI export imports the FastAPI app, so the Python interpreter must have backend dependencies installed.

The wrapper chooses Python in this order:

1. `SUN_WORLD_API_PYTHON`
2. `apps/api/.venv/Scripts/python.exe` on Windows
3. `apps/api/.venv/bin/python` on Unix-like systems
4. `python`
5. `python3`

Example:

```bash
SUN_WORLD_API_PYTHON=/path/to/python pnpm -F @sun-world/contracts generate
```

The export script builds a schema-only FastAPI app, mounts the project routers, and stubs runtime-only AI objects that would otherwise require credentials at import time. It does not start uvicorn, run lifespan startup, initialize databases, connect to LLM providers, or read secret env files.

## Frontend Usage

```ts
import type { components, paths } from '@sun-world/contracts'
```

Frontend code should use API request/response types from this package rather than database schema types.

The package also exposes stable route constants and small shared protocol types:

```ts
import { API_ROUTES, DEFAULT_PAGE_SIZE } from '@sun-world/contracts'
import type { ApiResponse, PageResult } from '@sun-world/contracts'
```

Rules:

- Keep business runtime code out of this package.
- Keep Python models as the OpenAPI source of truth.
- Add only route constants and protocol types that are consumed by more than one frontend/backend boundary.

## Prisma

Prisma is not active in this package. Reconsider it only if the backend moves to Node/TypeScript or a dedicated TypeScript data service is introduced.
