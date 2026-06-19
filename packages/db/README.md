# @sun-world/db

数据库访问层预留包。
Reserved package for a future database access layer.

## 状态 / Status

**当前未激活 / Not Active**

## 原因 / Rationale

当前后端使用 Python/FastAPI，数据库访问通过以下方式处理：

- MySQL → `pymysql` (位于 `apps/api/src/database/mysql/`)
- MongoDB → `pymongo` + `motor` (位于 `apps/api/src/database/mongo/`)
- Redis → `redis` + `aioredis` (位于 `apps/api/src/database/redis/`)
- PostgreSQL → `psycopg2` + `asyncpg` (位于 `apps/api/src/database/postgresql/`)

The backend is currently Python/FastAPI.

## 激活条件 / When to Activate

仅在以下场景下引入 Prisma 到此包：

1. 后端迁移至 TypeScript（如 NestJS、Fastify、Hono）。
2. 引入独立的 TypeScript 数据服务。
3. 项目需要 schema-first 的关系型数据库迁移（JS/TS）。

Introduce Prisma to this package ONLY when:

1. The backend moves to TypeScript (NestJS, Fastify, Hono).
2. A dedicated TypeScript data service is introduced.
3. The project wants schema-first relational database migrations in JS/TS.

## 当前不要 / Do Not Yet

- 不要在此阶段添加 Prisma 依赖或 schema 文件。
- 不要复制 `apps/api/src/database/` 中的 Python 数据库管理器到此包。
- Do not add Prisma dependencies or schema files in this phase.
- Do not copy Python database managers from `apps/api/src/database/` into this package.
