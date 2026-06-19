# Frontend Deploy

前端通过 Docker 部署，容器名 `my-frontend`，宿主机端口 `8081`。
The frontend is deployed via Docker, container name `my-frontend`, host port `8081`.

## 手动部署 / Manual Deploy

```bash
cd /home/lighthouse/blog/sun-world
docker build --no-cache -t blog-front:latest .
docker rm -f my-frontend || true
docker run -d --restart unless-stopped --name my-frontend -p 8081:80 blog-front:latest
```

## 自动部署 / Auto Deploy

`sun-world-auto-deploy.timer` 每日 03:30 CST 从 `origin/main` 自动构建部署。
The systemd timer `sun-world-auto-deploy.timer` auto-builds from `origin/main` daily at 03:30 CST.

```bash
sudo systemctl status sun-world-auto-deploy.timer
sudo systemctl start sun-world-auto-deploy.service
sudo tail -100 /var/log/sun-world-auto-deploy.log
```

## GitHub Actions Deploy

`.github/workflows/deploy-frontend.yml` defines the GitHub Actions frontend
deployment pipeline. It runs on every `main` branch push and can also be run
manually with `workflow_dispatch`; choose the `main` branch for manual
production deploys.

The workflow uses `concurrency` with `cancel-in-progress: true`, so if multiple
`main` changes arrive while a deploy is still running, the older in-progress run
is canceled and the newest commit wins.

The pipeline:

1. installs dependencies with pnpm,
2. runs `pnpm check:web`,
3. uploads the generated frontend `dist` directory as an artifact,
4. uploads deployment metadata as an artifact,
5. builds and pushes `ghcr.io/zhangnoname/sun-world-frontend`,
6. runs `pnpm check:api`,
7. builds and pushes `ghcr.io/zhangnoname/sun-world-api`,
8. uploads API deployment metadata as an artifact,
9. SSHes to the Lighthouse server,
10. pulls the commit-specific frontend image tag,
11. recreates the `my-frontend` container,
12. runs the API image's MySQL schema migration command,
13. verifies `https://sunworld.site` and `https://www.sunworld.site`.

Images are pushed with both tags:

```text
ghcr.io/zhangnoname/sun-world-frontend:<git-sha>
ghcr.io/zhangnoname/sun-world-frontend:latest
```

The server deploy step uses the `<git-sha>` tag instead of `latest` so a
specific deployment can be audited or rolled back.

The API image is also pushed with both tags:

```text
ghcr.io/zhangnoname/sun-world-api:<git-sha>
ghcr.io/zhangnoname/sun-world-api:latest
```

The API image is not started by this workflow. It is used to run
`python -m src.database.mysql.schema_migration --mode apply` on the server, so
new backend builds can add missing MySQL tables or columns before a later API
cutover. Existing incompatible columns make the workflow fail rather than
rewriting data.

### Required GitHub Variables

Configure these under GitHub repository settings as Variables:

```text
LIGHTHOUSE_HOST      # server host or IP
LIGHTHOUSE_USER      # SSH user, for example lighthouse
LIGHTHOUSE_PORT      # optional, defaults to 22
```

Optional GitHub Actions variables:

```text
VITE_BASE_URL
VITE_TELEMETRY_ENDPOINT
```

### Required GitHub Secrets

Configure this under GitHub repository settings as a Secret:

```text
LIGHTHOUSE_SSH_KEY   # private SSH key for deployment
```

Do not commit SSH keys, GHCR tokens, `.env` values, or server secrets to the
repository.

GitHub Actions publishes to GHCR with the built-in `GITHUB_TOKEN` and requires
workflow package write permission. The server must already be able to pull the
GHCR image, for example through a prior `docker login ghcr.io`.

When unset, the workflow uses the production defaults:

```text
https://api.sunworld.site
https://api.sunworld.site/telemetry/events
```

Artifacts are retained for 30 days:

- `frontend-dist-<git-sha>` keeps the generated `apps/web/dist` output.
- `frontend-deploy-metadata-<git-sha>` keeps the image tag, commit, build
  manifest, and build summary.
- `api-deploy-metadata-<git-sha>` keeps the API image tag and commit.

## 验证 / Verification

```bash
curl -I https://sunworld.site
curl -I https://www.sunworld.site
```

## Dockerfile

根目录的 `Dockerfile` 是构建来源。
The root `Dockerfile` is the build source.

构建流程 / Build flow:
1. 使用 Node 22 镜像安装 pnpm 并构建 `apps/web`
2. 将 `apps/web/dist` 复制到 Nginx Alpine 镜像中
3. Nginx 在 80 端口提供静态文件服务

1. Node 22 image installs pnpm and builds `apps/web`
2. `apps/web/dist` is copied into the Nginx Alpine image
3. Nginx serves static files on port 80

## Compose

The frontend can also be built and run through Docker Compose:

```bash
docker compose build frontend
docker compose up -d frontend
```

This keeps the same production container name and port mapping:

- Container: `my-frontend`
- Host port: `8081`
- Container port: `80`
