# Sun World 🌍

Sun World 是一个全栈单体仓库（monorepo），包含博客前端、后端 API 及可复用组件库。

Sun World is a full-stack monorepo containing the blog frontend, backend API, and reusable component libraries.

## 仓库结构 / Repository Layout

```
sun-world/
├── apps/
│   ├── web/          # 博客前端 / Blog frontend (Vue 3 + Vite)
│   └── api/          # 后端 API / Backend API (FastAPI + Python)
├── packages/
│   ├── editor/       # 富文本编辑器组件 / Rich text editor library (@sun-world/editor)
│   ├── icons/        # 图标组件库 / Icon component library (@sun-world/icons)
│   ├── contracts/    # 前后端契约 / Shared API contracts (planned)
│   └── db/           # 数据库访问层 / Database access layer (planned, not active)
├── deploy/           # 部署文档与示例 / Deployment docs and examples
├── docs/             # 项目文档 / Project documentation
└── scripts/          # 检查脚本 / Verification scripts
```

## 应用 / Applications

### apps/web — 博客前端 / Blog Frontend

- 框架 / Framework: Vue 3 + Vite + TypeScript
- UI 库 / UI Library: Element Plus
- 包名 / Package: `@sun-world/blog`
- 生产域名 / Production: https://sunworld.site

```bash
pnpm dev:web        # 启动开发服务器 / Start dev server
pnpm build:web      # 构建生产产物 / Build for production
```

### apps/api — 后端 API / Backend API

- 框架 / Framework: FastAPI (Python 3.11)
- 包管理 / Package Manager: Poetry
- 生产域名 / Production: https://api.sunworld.site
- 当前运行时路径 / Current Runtime Path: `/home/lighthouse/blog/blog_end`

> **注意：** 后端生产服务目前仍从 `/home/lighthouse/blog/blog_end` 运行，尚未切入 monorepo 路径。详见 `docs/architecture/deployment-cutover.md`。
> **Note:** The backend production service still runs from `/home/lighthouse/blog/blog_end`. It has not been cut over to the monorepo path yet. See `docs/architecture/deployment-cutover.md`.

```bash
cd apps/api
poetry install       # 安装依赖 / Install dependencies
python main.py       # 启动开发服务器 / Start dev server (port 8000)
```

## 共享包 / Shared Packages

### @sun-world/editor — 编辑器 / Rich Text Editor

```bash
pnpm build:editor          # 构建 / Build
pnpm -F @sun-world/editor build   # 等价方式 / Equivalent
```

### @sun-world/icons — 图标库 / Icon Library

```bash
pnpm build:icons           # 构建 / Build
pnpm dev:icons             # 开发模式 / Dev mode
```

### contracts（规划中 / Planned）

前端和后端的共享类型与 API 契约。当前尚未生成。
Shared types and API contracts between frontend and backend. Not yet generated.

### db（规划中 / Planned）

数据库访问层预留。当前后端使用 Python/FastAPI 直接访问数据库，因此 Prisma/TypeScript 数据库层暂不激活。
Reserved for a future database access layer. Not active because the backend is Python/FastAPI.

## 项目命令 / Root Scripts

```bash
pnpm dev              # 启动所有开发服务 / Start all dev services
pnpm build            # 构建所有项目 / Build all projects
pnpm build:web        # 构建前端 / Build frontend
pnpm build:blog       # build:web 的兼容别名 / Compatibility alias for build:web
pnpm check:web        # 检查前端 / Check frontend
pnpm check:api        # 检查后端 / Check backend
pnpm check            # 运行所有检查 / Run all checks
bash scripts/check-all.sh   # 完整检查 / Full verification
```

## 文档 / Documentation

- [当前状态 / Current State](docs/current-state.md)
- [工程规范 / Engineering Conventions](docs/engineering-conventions.md)
- [单体仓库迁移计划 / Monorepo Migration Plan](docs/architecture/monorepo-migration.md)
- [部署切换指南 / Deployment Cutover Guide](docs/architecture/deployment-cutover.md)
- [环境变量与密钥管理 / Secrets and Env Management](docs/architecture/secrets-and-env.md)
- [任务交接 / Agent Handoff](docs/agent-handoff.md)

## 部署 / Deployment

项目部署于腾讯云轻量云服务器。
The project is deployed on a Tencent Cloud Lighthouse server.

- 前端通过 Docker 容器 `my-frontend` 在端口 `8081` 运行
- 后端通过 systemd `blog-api.service` 在端口 `8000` 运行
- Nginx 处理 HTTPS 和域名代理
- 每日 03:30 CST 自动从 `main` 分支部署

详见 `deploy/` 目录。
For details, see the `deploy/` directory.

## ICP 备案 / ICP Filing

```
豫ICP备2024081960号
```

## License

See [LICENSE](LICENSE).
