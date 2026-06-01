# @sun-world/contracts

共享 API 契约包。用于存放前端和后端之间的共享类型定义和 API 规范。
Shared API contracts package. Houses shared type definitions and API specifications between frontend and backend.

## 用途 / Purpose

当前状态：**规划中 / Planned**。尚未生成任何内容。

规划内容 / Planned contents:

```
packages/contracts/
├── openapi.json            # OpenAPI 规范 / specification
├── src/
│   └── generated-api-types.ts  # 生成的 TypeScript 类型 / Generated TypeScript types
└── README.md
```

## 生成方式 / Generation

1. 从后端 FastAPI 生成 OpenAPI 规范。
2. 使用 `openapi-typescript` 等工具从 OpenAPI 规范生成 TypeScript 类型。
3. 前端直接引用 `@sun-world/contracts` 包中的类型。

1. Generate OpenAPI spec from the backend FastAPI app.
2. Use `openapi-typescript` or similar to generate TypeScript types from the OpenAPI spec.
3. Frontend imports types from the `@sun-world/contracts` package directly.

## 注意事项 / Notes

- 此包在 Phase 3 之前不需要功能代码。
- 不要在前端和后端仓库之间手动同步类型——应使用代码生成方式。
- This package does not need functional code until Phase 3 of the monorepo migration.
- Do not manually synchronize types between frontend and backend repos — use code generation.
