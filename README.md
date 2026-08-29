# Sun World 🌍

Sun World 是一个全栈单体仓库（monorepo），包含博客前端、后端 API 及可复用组件库。

Sun World is a full-stack monorepo containing the blog frontend, backend API, and reusable component libraries.

## 仓库结构 / Repository Layout

```
sun-world/
├── apps/
│   ├── web/          # 博客前端 / Blog frontend (React 19 + Vite)
│   └── api/          # 后端 API / Backend API (FastAPI + Python)
├── packages/
│   ├── editor/       # 富文本编辑器组件 / Rich text editor library (@sun-world/editor)
│   ├── icons/        # 图标组件库 / Icon component library (@sun-world/icons)
│   ├── ai-ui/        # AI 工作区界面 / Reusable AI workspace UI (@sun-world/ai-ui)
│   ├── ai-composer/  # AI 输入框 / Reusable AI composer (@sun-world/ai-composer)
│   ├── contracts/    # 前后端契约 / Shared API contracts
│   └── db/           # 数据库访问层 / Database access layer (planned, not active)
├── deploy/           # 部署文档与示例 / Deployment docs and examples
├── docs/             # 项目文档 / Project documentation
└── scripts/          # 检查脚本 / Verification scripts
```

## 应用 / Applications

### apps/web — 博客前端 / Blog Frontend

- 框架 / Framework: React 19 + React Router + Vite + TypeScript
- UI 库 / UI Library: `@sun-world/base-ui`（冻结的 shadcn/Base UI 基础组件）与
  `@sun-world/ui`（Sun World 协议和业务组合层）
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

### @sun-world/contracts — API 契约 / API Contracts

前端和后端共享的类型、路由常量和 OpenAPI 契约。
Shared types, route constants, and OpenAPI contracts between frontend and backend.

### @sun-world/ai-ui — AI 工作区 / AI Workspace UI

可复用的 AI 会话外壳、消息操作、服务商设置和结构化内容渲染器。应用层只负责数据与事件适配。
Reusable AI workspace shell, message actions, provider settings, and structured-content renderers. Applications only adapt data and events.

### @sun-world/ai-composer — AI 输入框 / AI Composer

ChatGPT 工作模式风格的独立受控输入框，支持 Markdown 源文本提交、提交时附件交付、模型切换、斜杠命令、浏览器语音权限流程与命令式 API。使用说明见 `packages/ai-composer/README.md`。

### db（规划中 / Planned）

数据库访问层预留。当前后端使用 Python/FastAPI 直接访问数据库，因此 Prisma/TypeScript 数据库层暂不激活。
Reserved for a future database access layer. Not active because the backend is Python/FastAPI.

## 项目命令 / Root Scripts

```bash
pnpm dev              # 启动所有开发服务 / Start all dev services
pnpm build            # 构建所有项目 / Build all projects
pnpm build:web        # 构建前端 / Build frontend
pnpm build:ai-ui      # 构建 AI 界面包 / Build AI UI package
pnpm build:ai-composer # 构建 AI 输入框包 / Build AI composer package
pnpm build:blog       # build:web 的兼容别名 / Compatibility alias for build:web
pnpm check:web        # 检查前端 / Check frontend
pnpm check:api        # 检查后端 / Check backend
pnpm check            # 运行所有检查 / Run all checks
bash scripts/check-all.sh   # 完整检查 / Full verification
```

## 文档 / Documentation

- [当前状态 / Current State](docs/current-state.md)
- [工程规范 / Engineering Conventions](docs/engineering-conventions.md)
- [React 开发规范 / React Development Guidelines](docs/react-development-guidelines.md)
- [贡献指南 / Contributing Guide](CONTRIBUTING.md)
- [项目架构 / Project Architecture](docs/architecture/project-architecture.md)
- [前端平台基础 / Frontend Platform Foundation](docs/architecture/frontend-platform-foundation.md)
- [前端主题系统 / Frontend Theme System](docs/architecture/frontend-theme-system.md)
- [前端动效系统 / Frontend Motion System](docs/architecture/frontend-motion-system.md)
- [商业平台蓝图 / Commercial Platform Blueprint](docs/architecture/commercial-platform-blueprint.md)
- [可观测性与分析 / Observability and Analytics](docs/architecture/observability-and-analytics.md)
- [API 契约 / API Contracts](docs/architecture/api-contracts.md)
- [AI 平台架构 / AI Platform Architecture](docs/architecture/ai-platform.md)
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
