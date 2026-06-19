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

`docker-compose.yml` may include an `api` service behind an explicit `api`
profile. This is for build and cutover rehearsal only. Do not start it against
production ports unless the backend cutover task explicitly authorizes that
change.

Safe validation commands:

```bash
docker compose config
docker compose --profile api build api
```

Starting the API profile is a deployment/cutover action and is intentionally not
part of routine verification.

## GitHub Actions API Image

The frontend deployment workflow also builds the Python API image after the
frontend package/check stage succeeds.

Image tags:

```text
ghcr.io/zhangnoname/sun-world-api:<git-sha>
ghcr.io/zhangnoname/sun-world-api:latest
```

When Tencent Cloud Container Registry is configured in GitHub Actions, the same
API image tags are also pushed to `TCR_API_IMAGE_NAME`, and the Lighthouse
deploy step pulls that TCR tag instead of GHCR. This keeps API schema apply
close to the Tencent Cloud server and avoids slow cross-registry pulls.

The workflow keeps an `api-deploy-metadata-<git-sha>` artifact with the image
tag and commit. It does not start the API container and does not replace
`blog-api.service`; backend traffic remains on the existing production service
until a separate cutover is approved.

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
image with the production secret env file mounted read-only:

```bash
sudo docker run --rm --network host \
  -v /home/lighthouse/.config/blog_end/auth.env:/run/blog_end/auth.env:ro \
  ghcr.io/zhangnoname/sun-world-api:<git-sha> \
  /bin/sh -lc 'set -euo pipefail; set -a; . /run/blog_end/auth.env; set +a; python -m src.database.mysql.schema_migration --mode apply'
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
