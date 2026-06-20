# Secrets and Environment Variables

环境变量与密钥管理规范。
Guidelines for managing secrets and environment variables.

## 原则 / Principles

- **绝不提交密钥** — `.env` 文件、密钥文件、证书私钥不得进入 Git。
- **使用 `.env.example`** — 每个需要环境变量的应用应提供仅有变量名和占位符的示例文件。
- **密钥集中存放** — 生产密钥存放在服务级别路径（如 `/home/lighthouse/.config/`），不混入仓库。
- **Never commit secrets** — `.env` files, key files, and certificate private keys must not enter Git.
- **Use `.env.example`** — Each app that needs env vars should provide an example file with variable names and placeholders only.
- **Centralize secrets** — Production secrets live at service-level paths (e.g., `/home/lighthouse/.config/`) and are not mixed into the repository.

## .gitignore 规则 / .gitignore Rules

Root `.gitignore`:

```
.env
.env.*
!.env.example
```

各子目录也有对应的 `.gitignore` 规则。
Subdirectories also have corresponding `.gitignore` rules.

## 前端 / Frontend (`apps/web`)

### 已处理的文件 / Processed Files

- `apps/web/.env` — 已从 Git 追踪中移除（保留本地文件）
- `apps/web/.env.development` — 已从 Git 追踪中移除
- `apps/web/.env.production` — 已从 Git 追踪中移除
- `apps/web/.env.example` — 已添加，包含变量名和占位符

- `apps/web/.env` — removed from Git tracking (local file kept)
- `apps/web/.env.development` — removed from Git tracking
- `apps/web/.env.production` — removed from Git tracking
- `apps/web/.env.example` — added with variable names and placeholders

### 变量参考 / Variable Reference

| 变量 / Variable | 用途 / Purpose | 敏感度 / Sensitivity |
|---|---|---|
| `VITE_BASE_URL` | API 基础路径 / API base path | 低 / Low |
| `VITE_APP_TITLE` | 应用标题 / App title | 低 / Low |
| `VITE_LANGCHAIN_*` | LangChain/LangSmith 配置 | 中 / Medium (API key) |

> **注意:** `VITE_LANGCHAIN_API_KEY` 在前端代码中是内置的，因此如果前端已编译并提交了密钥，即使移除 `.env` 文件也无法完全清除。构建产物（`dist/`）中可能仍包含这些值。如已泄露，应在 LangSmith 端轮换密钥。
> **Note:** `VITE_LANGCHAIN_API_KEY` is bundled into the frontend build. Removing `.env` files does not retroactively remove keys from committed history or build artifacts (`dist/`). If exposed, rotate the key on the LangSmith side.

Current rule: do not put LangSmith, LangChain, OpenAI, or other private API
keys in `VITE_*` variables. Vite bundles those values into browser JavaScript.
If a key has ever been committed or bundled, rotate or revoke it on the
provider side.

## 后端 / Backend (`apps/api`)

### 当前状态 / Current State

- 后端 `.env` 文件未在仓库中追踪。
- 生产密钥文件位于 `/home/lighthouse/.config/blog_end/auth.env`。
- 密钥文件路径在 `blog-api.service` 的 `EnvironmentFile` 指令中指定。
- Backend `.env` files are not tracked in the repo.
- Production secrets live at `/home/lighthouse/.config/blog_end/auth.env`.
- The secret file path is specified in `blog-api.service` via `EnvironmentFile`.
- LangSmith tracing keys are server-side only. The API reads
  `LANGSMITH_API_KEY`, with `LANGCHAIN_API_KEY` as a compatibility fallback.
  Do not expose either value through `VITE_*`.

### 切换后 / After Cutover

切换到 monorepo 路径后，密钥文件路径不变，以减小变更范围。
After cutting over to the monorepo path, the secret file path remains unchanged to minimize churn.

## 安全扫描 / Security Scanning

运行文件名扫描以检查可疑模式（仅报告文件路径，不打印内容）：
Run filename-level scans for sensitive patterns (report file paths only, never content):

```bash
git grep -IlE 'sk-[A-Za-z0-9]|password:|password=|token:|token=|secret:|secret=|api[_-]?key|BEGIN .*KEY' -- . ':!pnpm-lock.yaml' ':!poetry.lock' ':!**/dist/**' || true
```

Frontend client bundle guard:

```bash
node scripts/check-web-client-secrets.mjs
```

## 已知注意事项 / Known Notes

- `apps/api/src/conf/local.yml` 可能包含服务配置，不在本阶段处理。
- 证书文件（`sunworld.site.*`）已在 `.gitignore` 中排除。
- `apps/api/src/conf/local.yml` may contain service configuration — out of scope for this phase.
- Certificate files (`sunworld.site.*`) are already excluded in `.gitignore`.
