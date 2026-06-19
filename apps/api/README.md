# blog_end

博客后端 — FastAPI backend for the sunworld blog.

## 快速开始 / Quick Start

```bash
./start.sh
```

服务监听 `http://0.0.0.0:8000`，进程健康检查端点 `/healthz`，依赖就绪检查端点 `/readyz`。
The server listens on `http://0.0.0.0:8000`. Process health check at `/healthz`; dependency readiness check at `/readyz`.

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

后端以 systemd 服务运行在 Nginx 之后。
The backend runs as a systemd service behind Nginx.

| 项目 Item | 详情 Detail |
|-----------|-------------|
| 服务 Service | `blog-api.service` |
| 端口 Port | `8000` |
| 域名 Domain | `api.sunworld.site` |
| 密钥文件 Secret file | `/home/lighthouse/.config/blog_end/auth.env` |

### 服务命令 / Service Commands

```bash
sudo systemctl status blog-api.service       # 查看状态 / check status
sudo systemctl restart blog-api.service      # 重启 / restart
sudo journalctl -u blog-api.service -n 100 --no-pager  # 最近日志 / recent logs
curl -fsS http://127.0.0.1:8000/healthz      # 本地健康检查 / local health
curl -fsS http://127.0.0.1:8000/readyz       # 本地就绪检查 / local readiness
curl -fsS https://api.sunworld.site/healthz  # 公网健康检查 / public health
```

### 文档 / Documentation

| 文件 File | 内容 Content |
|-----------|--------------|
| `docs/current-state.md` | 当前部署状态 / current deployment state |
| `docs/agent-handoff.md` | 任务交接记录 / task handoff between agents |
| `docs/security-hardening-plan.md` | 安全加固计划 / security hardening status |
| `AGENTS.md` | 项目契约与禁止操作 / project contract and forbidden operations |
| `CLAUDE.md` | Claude Code 使用约定 / how Claude Code works in this repo |
