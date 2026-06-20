# Backend Deploy

后端通过 Docker 常驻容器 `sun-world-api` 运行，监听端口 `8000`。
The backend runs as the persistent Docker container `sun-world-api` on port
`8000`.

## 当前生产配置 / Current Production

- **镜像 / Image:** `sun-world-api:<git-sha>`
- **容器 / Container:** `sun-world-api`
- **网络 / Network:** Docker host network
- **命令 / Command:** `./start.sh` -> `uvicorn main:app --host 0.0.0.0 --port 8000`
- **密钥文件 / Secrets:** `/home/lighthouse/.config/blog_end/auth.env`
- **兼容配置 / Legacy config mount:** `/home/lighthouse/blog/blog_end/src/conf -> /app/src/conf`

The legacy `blog-api.service` systemd unit is stopped and disabled by the
deploy workflow after the Docker candidate passes health checks. It remains a
rollback path if the production Docker container fails to start.

## Production Container Cutover

The GitHub Actions deploy job uses a guarded cutover:

1. Build `sun-world-api:<git-sha>` on Lighthouse.
2. Run `schema_migration --mode apply` from that image.
3. Start `sun-world-api-candidate` on host-network port `18000`.
4. Verify `http://127.0.0.1:18000/healthz`.
5. Stop and disable `blog-api.service`.
6. Start persistent `sun-world-api` on host-network port `8000`.
7. Verify `http://127.0.0.1:8000/healthz` and
   `https://api.sunworld.site/healthz`.
8. If the production container health check fails, remove the container and
   attempt to re-enable/start `blog-api.service`.

## Compose Candidate

`docker-compose.yml` includes the API service behind an explicit `api` profile.
It is safe to build and run as a staging container because it binds to
`127.0.0.1:${BLOG_API_HOST_PORT:-18000}` by default, not the production
`127.0.0.1:8000` backend port used by `blog-api.service`.

Safe validation commands:

```bash
docker compose config
docker compose --profile api build api
docker compose --profile api up -d api
curl -fsS http://127.0.0.1:18000/healthz
```

Starting the API profile does not change Nginx routing by itself. Production
traffic continues to use the production `sun-world-api` container unless Nginx
is deliberately updated to proxy `api.sunworld.site` to the Compose API port.

The Compose API service mounts the same production-only paths read-only for
secrets and config:

```text
/home/lighthouse/.config/blog_end -> /home/lighthouse/.config/blog_end
/home/lighthouse/blog/blog_end/src/conf -> /app/src/conf
```

It also mounts `/data/blog` read/write so existing file paths remain usable in
the container. Do not commit or print values from those mounted files.

## GitHub Actions API Image

The deployment workflow builds the Python API image on Lighthouse when
API-related files change. GitHub Actions no longer builds or pushes the API
image to Tencent CCR because the GitHub-to-CCR API image push path repeatedly
stalled.

Image tag:

```text
sun-world-api:<git-sha>
```

The API build job SSHes to Lighthouse, syncs
`/home/lighthouse/blog/sun-world` to `origin/main`, and runs:

```bash
sudo docker build --progress=plain -t sun-world-api:<git-sha> -f apps/api/Dockerfile apps/api
```

It also keeps an `api-deploy-metadata-<git-sha>` artifact with the local image
tag and commit. The deploy job starts the persistent `sun-world-api` container
after schema migration and candidate health checks pass.

The GitHub Actions SSH session uses keepalive options for the server-side build.
The API Dockerfile rewrites Debian apt sources to Tencent Cloud mirrors before
installing `bash` and `libpq5`, and pip uses Tencent's PyPI mirror, so Lighthouse builds
avoid the slow GitHub-to-CCR upload path and reduce cross-region package
downloads.

## MySQL Schema Guard

The API image contains a conservative MySQL schema migration module:

```bash
python -m src.database.mysql.schema_migration --mode check
python -m src.database.mysql.schema_migration --mode plan
python -m src.database.mysql.schema_migration --mode validate
python -m src.database.mysql.schema_migration --mode apply
```

`check` is static and runs in CI through `pnpm check:api`. The database modes
connect with the same API config used by the app. `apply` only creates missing
application tables and adds missing application columns. If an existing column
has an incompatible type, the command fails instead of rewriting data.

During the GitHub Actions deploy, the server runs the migration from the new API
image with the production secret env directory mounted read-only. If the legacy
backend config directory exists, the deploy script also mounts it into the
container at `/app/src/conf` so the schema apply and runtime see the same
config files as the current production service:

```bash
API_MOUNTS=(
  -v /home/lighthouse/.config/blog_end:/home/lighthouse/.config/blog_end:ro
)
if [ -d /home/lighthouse/blog/blog_end/src/conf ]; then
  API_MOUNTS+=(
    -v /home/lighthouse/blog/blog_end/src/conf:/app/src/conf:ro
  )
fi
sudo docker run --rm --network host \
  "${API_MOUNTS[@]}" \
  sun-world-api:<git-sha> \
  /bin/sh -lc 'set -euo pipefail; set -a; . /home/lighthouse/.config/blog_end/auth.env; set +a; python -m src.database.mysql.schema_migration --mode apply'

API_ENV=(
  -e BLOG_SECRET_ENV_FILE=/home/lighthouse/.config/blog_end/auth.env
)

sudo docker run -d --name sun-world-api-candidate --network host \
  "${API_ENV[@]}" \
  -e BLOG_PORT=18000 \
  "${API_MOUNTS[@]}" \
  sun-world-api:<git-sha>
curl -fsS http://127.0.0.1:18000/healthz
sudo docker logs --tail 120 sun-world-api-candidate
sudo docker rm -f sun-world-api-candidate

sudo systemctl stop blog-api.service || true
sudo systemctl disable blog-api.service || true
sudo docker rm -f sun-world-api || true
sudo docker run -d --restart unless-stopped --name sun-world-api --network host \
  "${API_ENV[@]}" \
  -e BLOG_PORT=8000 \
  "${API_MOUNTS[@]}" \
  sun-world-api:<git-sha>
curl -fsS http://127.0.0.1:8000/healthz
curl -fsS https://api.sunworld.site/healthz
```

Do not print the secret file contents. The `--network host` flag preserves
current production database host assumptions such as `localhost`.

## 验证 / Verification

```bash
curl -fsS http://127.0.0.1:8000/healthz
curl -fsS https://api.sunworld.site/healthz
```

## 示例文件 / Example File

`blog-api.service.example` 提供了未来 monorepo 路径的服务单元示例。
The example service unit shows the planned monorepo path.
