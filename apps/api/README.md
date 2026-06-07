# blog_end

博客后端 — FastAPI backend for the sunworld blog.

## 快速开始 / Quick Start

```bash
./start.sh
```

服务监听 `http://0.0.0.0:8000`，进程健康检查端点 `/healthz`，依赖就绪检查端点 `/readyz`。
The server listens on `http://0.0.0.0:8000`. Process health check at `/healthz`; dependency readiness check at `/readyz`.

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
