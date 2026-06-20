# Backend Deploy

后端通过 systemd 服务 `blog-api.service` 运行，监听端口 `8000`。
The backend runs via systemd service `blog-api.service` on port `8000`.

## 当前生产配置 / Current Production

- **工作目录 / Working Directory:** `/home/lighthouse/blog/blog_end`
- **服务名 / Service:** `blog-api.service`
- **命令 / Command:** `uvicorn main:app --host 127.0.0.1 --port 8000`
- **密钥文件 / Secrets:** `/home/lighthouse/.config/blog_end/auth.env`

## 未来切换 / Future Cutover

切换至 monorepo 路径时，需要更新：
Backend code now lives in `apps/api`, but production traffic is not cut over by
that fact alone. When cutting over to the monorepo path, update:

1. `blog-api.service` 的 `WorkingDirectory` 改为 `/home/lighthouse/blog/sun-world/apps/api`
2. 在 `apps/api` 下重建 `.venv` 或配置运行时虚拟环境
3. 保持密钥文件路径不变以减少变更范围
4. 重启服务并验证

详见 `docs/architecture/deployment-cutover.md`。
See `docs/architecture/deployment-cutover.md` for details.

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
traffic continues to use `blog-api.service` until Nginx is deliberately updated
to proxy `api.sunworld.site` to the Compose API port, or the Compose API is
bound to `127.0.0.1:8000` during a planned cutover.

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
tag and commit. It does not start the API container and does not replace
`blog-api.service`; backend traffic remains on the existing production service
until a separate cutover is approved.

The GitHub Actions SSH session uses keepalive options for the server-side build.
The API Dockerfile rewrites Debian apt sources to Tencent Cloud mirrors before
installing `libpq5`, and pip uses Tencent's PyPI mirror, so Lighthouse builds
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
container at `/app/src/conf` so the schema apply sees the same config files as
the current production service:

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
