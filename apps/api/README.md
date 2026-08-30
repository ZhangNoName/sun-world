# blog_end

博客后端 — FastAPI backend for the sunworld blog.

## 快速开始 / Quick Start

```bash
./start.sh
```

服务监听 `http://0.0.0.0:8000`，进程健康检查端点 `/healthz`，依赖就绪检查端点 `/readyz`。
The server listens on `http://0.0.0.0:8000`. Process health check at `/healthz`; dependency readiness check at `/readyz`.

## 本地环境变量 / Local Environment Variables

`apps/api/.env.example` documents the supported authentication, OAuth, OTP,
AI, and timeout variables. Copy it to the Git-ignored `.env` only for local
development; never place real secrets in the example file or in `VITE_*`
frontend variables.

```bash
cp apps/api/.env.example apps/api/.env
```

The root `corepack pnpm dev:api` launcher listens on port `8030` and inherits
the current shell environment; it does not automatically load `apps/api/.env`.
Load the file explicitly before starting the API:

```bash
set -a
. apps/api/.env
set +a
corepack pnpm run dev:api -- --reload
```

For Google login, create a Google OAuth client with application type `Web
application`, then set `AUTH_GOOGLE_CLIENT_ID` and
`AUTH_GOOGLE_CLIENT_SECRET`. Both must be present. With the standard local
launcher, register this exact authorized redirect URI:

```text
http://localhost:8030/auth/oauth/google/callback
```

Production uses `https://api.sunworld.site/auth/oauth/google/callback` and
stores the client credentials in
`/home/lighthouse/.config/blog_end/auth.env`. Keep the browser hostname
consistent during local OAuth testing; do not mix `localhost` and `127.0.0.1`.
If you run `apps/api/start.sh` directly on its default port `8000`, change both
`AUTH_PUBLIC_API_ORIGIN` and the Google authorized redirect URI to port `8000`.

After restarting the API, verify that the backend recognized the client without
printing either credential:

```bash
curl -fsS http://127.0.0.1:8030/auth/methods |
  jq '.data[] | select(.id == "google")'
```

The result should contain `"enabled": true`; a real browser authorization is
still required to validate the secret, consent-screen audience, and exact
redirect URI together.

## 本地数据库覆盖 / Local Database Overrides

The API loads `src/conf/<env>.yml` first, then overlays `src/conf/<env>.override.yml`
when that file exists. `src/conf/<env>.override.yml` is the recommended path.

You can also point to another override file with `BLOG_CONFIG_OVERRIDE`, but that
file should live in a Git-ignored location (for example outside repo tracked
files) and must not contain committed secrets.

For local development against the server databases:

```bash
cp src/conf/local.override.example.yml src/conf/local.override.yml
```

Then fill only local machine values and secrets in `local.override.yml`.
By default, this override path is recommended and expected to remain Git-ignored.
If you use a custom path via `BLOG_CONFIG_OVERRIDE`, keep it outside version control
and do not commit real database credentials.

## 部署 / Deployment

当前后端以 Docker 容器 `sun-world-api` 运行在 Nginx 之后；旧
`blog-api.service` 仅保留为回滚路径。
The current backend runs behind Nginx as the `sun-world-api` Docker container;
the legacy `blog-api.service` is retained only as a rollback path.

| 项目 Item | 详情 Detail |
|-----------|-------------|
| 服务 Service | Docker container `sun-world-api` |
| 端口 Port | `8000` |
| 域名 Domain | `api.sunworld.site` |
| 密钥文件 Secret file | `/home/lighthouse/.config/blog_end/auth.env` |

### 服务命令 / Service Commands

```bash
sudo docker ps --filter name=sun-world-api    # 查看状态 / check status
sudo docker restart sun-world-api            # 重启并重新加载 auth.env / restart and reload auth.env
sudo docker logs --tail 100 sun-world-api     # 最近日志 / recent logs
curl -fsS http://127.0.0.1:8000/healthz      # 本地健康检查 / local health
curl -fsS http://127.0.0.1:8000/readyz       # 本地就绪检查 / local readiness
curl -fsS https://api.sunworld.site/healthz  # 公网健康检查 / public health
```

See `deploy/backend/README.md` for the guarded candidate and production cutover
flow. Do not switch to the legacy systemd service merely to apply an OAuth
configuration change.

### 文档 / Documentation

| 文件 File | 内容 Content |
|-----------|--------------|
| `docs/current-state.md` | 当前部署状态 / current deployment state |
| `docs/agent-handoff.md` | 任务交接记录 / task handoff between agents |
| `docs/security-hardening-plan.md` | 安全加固计划 / security hardening status |
| `AGENTS.md` | 项目契约与禁止操作 / project contract and forbidden operations |
| `CLAUDE.md` | Claude Code 使用约定 / how Claude Code works in this repo |
