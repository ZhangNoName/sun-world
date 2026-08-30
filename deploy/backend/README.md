# Backend Deploy

后端通过 Docker 常驻容器 `sun-world-api` 运行，监听端口 `8000`。
The backend runs as the persistent Docker container `sun-world-api` on port
`8000`.

## 当前生产配置 / Current Production

- **镜像 / Image:** `sun-world-api:<git-sha>`
- **容器 / Container:** `sun-world-api`
- **网络 / Network:** Docker host network
- **重启策略 / Restart policy:** `unless-stopped`
- **命令 / Command:** `./start.sh` -> `uvicorn main:app --host 0.0.0.0 --port 8000 --no-access-log`
- **密钥文件 / Secrets:** `/home/lighthouse/.config/blog_end/auth.env`
- **兼容配置 / Legacy config mount:** `/home/lighthouse/blog/blog_end/src/conf -> /app/src/conf`

The legacy `blog-api.service` systemd unit is currently inactive and disabled.
The reviewed identity cutover does not use or start it for rollback; it
preserves and restores the existing Docker API container instead. The generic
full deploy retains its older systemd fallback behavior until that independent
deployment path is redesigned.

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

## AI Secrets

The repository Actions settings contain `AI_CREDENTIAL_ENCRYPTION_KEY` and
`DEEPSEEK_API_KEY`. Before an API cutover, the deploy job sends their values
through SSH standard input to `deploy/backend/sync_ai_secrets.py`. The helper
atomically updates only those two entries in the existing production secret
file, preserves all other variables, sets file mode `0600`, and emits no secret
values. Do not pass either value as a command-line argument or include it in
workflow logs.

## Google OAuth Client Import

Google's downloaded OAuth Web client JSON must stay on the operator's machine.
`import_google_oauth_client.py` reads that JSON only from standard input,
requires project `sun-world-507015` and only the exact production callback URI, and
updates only `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET`. It does
not print either value or copy the JSON to Lighthouse.

Google is deferred for the reviewed first identity cutover. Do not run this
importer during the QQ-only rollout; importing Google credentials intentionally
violates that rollout's exact provider matrix. Retain this helper for a later,
separately reviewed Google enablement after outbound connectivity is available.

Before importing, make sure the server checkout already contains the helper and
the existing `auth.env` is a regular file owned by the service user with mode
`0600`. For a later Google rollout, first create a separately reviewed
exact-SHA staging procedure based on
`docs/deployment/2026-08-29-identity-ai-cutover.md`; temporarily set
`IDENTITY_CUTOVER_ALLOWED_SHA`, push the reviewed main/API commit, and wait for
its quality/build-only staging run. Do not rely on an expected full-schema
deployment failure to place this helper on Lighthouse. Keep shell tracing
disabled, and stream the protected local file directly to the fixed remote
command:

```bash
set +x
ssh -T -p "$LIGHTHOUSE_PORT" "$LIGHTHOUSE_USER@$LIGHTHOUSE_HOST" \
  'python3 /home/lighthouse/blog/sun-world/deploy/backend/import_google_oauth_client.py /home/lighthouse/.config/blog_end/auth.env' \
  < "$GOOGLE_OAUTH_JSON_PATH"
```

The helper serializes changes with the AI secret synchronizer, preserves all
unrelated lines, atomically replaces the target, verifies mode `0600`, and
stores only the prior Google assignments in a mode-`0600` hidden rollback file
in the same directory; it never duplicates unrelated database, AI, or service
secrets. Validation completes before any write, and the target replacement is
atomic. The rollback action restores only those previous Google assignments,
so unrelated secret changes made after the import are retained:

```bash
ssh -T -p "$LIGHTHOUSE_PORT" "$LIGHTHOUSE_USER@$LIGHTHOUSE_HOST" \
  'python3 /home/lighthouse/blog/sun-world/deploy/backend/import_google_oauth_client.py --rollback /home/lighthouse/.config/blog_end/auth.env'
```

During that later reviewed Google enablement, do not restart the current API
outside its rollback-protected workflow. The candidate and public API must
report Google enabled before rollback coverage is released. Verify enablement
without printing the environment file or method response. A separate approved
credential rollback requires the same controlled API restart and verification:

```bash
curl -fsS https://api.sunworld.site/auth/methods |
  jq -e '.data[] | select(.id == "google" and .enabled == true)' >/dev/null
```

After the live callback smoke test and rollback window are complete, obtain
explicit approval and remove the exact hidden Google rollback file. This is a
destructive credential-cleanup step; do not delete the main `auth.env`, a
broader directory, or the operator's downloaded client JSON as part of it.

## MySQL Schema Guard

Before the first optional-identity deployment, follow
`docs/deployment/2026-08-29-identity-ai-cutover.md`. In particular, the
historical non-unique `idx_users_username` and the three identity tables use
the separate, exactly allowlisted and explicitly acknowledged
`identity_schema_migration`. Its default check is static, its plan/validate
modes are read-only, and it ignores unrelated legacy tables. The generic
deploy-time schema apply remains unchanged and will intentionally stop on any
full-contract mismatch.

GitHub Actions manual runs expose `schema_mode`, defaulting to `full`. The
one-time reviewed identity cutover may select `identity-20260829` only from
`refs/heads/main`, with `target=api` or `target=all`, and
`mode=deploy-existing`. It also requires the current workflow SHA, selected
image tag, and temporary repository variable
`IDENTITY_CUTOVER_ALLOWED_SHA` to be the same 40-character lowercase SHA, plus
the manually typed `identity_schema_ack=20260829_identity_schema`,
`identity_maintenance_ack=STOP_CURRENT_API_FOR_IDENTITY_CUTOVER`, and
`identity_timer_ack=AUTO_DEPLOY_TIMER_STOPPED_FOR_IDENTITY_CUTOVER`.
`target=web`, `build-only`, and `build-and-deploy` are rejected for scoped
apply.

The safe operational sequence uses the same reviewed SHA twice: set the
temporary variable before pushing the reviewed API commit so that matching
`main` push runs quality/build but forces `deploy_needed=false`; keep `main`
frozen; stop, disable, and runtime-mask the frontend auto-deploy timer; verify
the three exact Google/QQ/WeChat callback locations from
`sun-world-oauth-callback-no-log.conf` are installed root-owned at
`/etc/nginx/snippets/sun-world-oauth-callback-no-log.conf` and included inside
the API HTTPS server (never include the writable checkout directly); keep the
protected OAuth environment QQ-only; and run the image's read-only Redis 6.2+,
schema-plan, effective `BLOG_RUNTIME_ENV=production`, exact production API/Web
origin, exact QQ-only registry, and QQ outbound preflights. The server checkout
must also be clean across staged, unstaged, and non-ignored untracked files; a matching
`HEAD` alone is insufficient because a local Python file could shadow reviewed
code.
Those locations disable callback access/error persistence, and the
effective-config checker rejects routing that could bypass them. Then manually
run `deploy-existing` with the exact SHA and all three acknowledgements. A
normal or mismatched push remains `full` and deploys through the strict generic
guard. Clear the repository variable
immediately after the successful cutover, or immediately on abandonment unless
the same image has an approved retry. Restore the timer's recorded enabled and
active states after the final attempt.

At scoped execution time the workflow supports the verified Docker topology:
the current `sun-world-api` must be running, while `blog-api.service` remains
inactive and disabled. Before DDL it records the current API container ID/image,
renames the container to `sun-world-api-identity-backup`, stops it, and holds a
failure trap through migration, validate, candidate health, production start,
and public API health. A failure deletes the failed new container, verifies the
backup ID/image, renames it back, starts it with its preserved environment,
mounts, host network, port, restart policy, and old image configuration, then
checks local health. It never starts the disabled systemd service. For
`target=all`, frontend cutover begins only after public API health succeeds;
the current frontend container is renamed to a recorded rollback container and
is restored if the new frontend cannot start, pass direct local port-8081
health, or pass public health. Production
workflow concurrency queues runs with `cancel-in-progress: false`, and `main`
must remain frozen during the maintenance window. The deploy job timeout is 60
minutes, and it holds `/tmp/sun-world-docker-build.lock` across its remote
preflight, DDL, API cutover, and optional frontend cutover. A normal SSH HUP,
INT, or TERM reaches the rollback trap; an untrappable process kill or host
reboot requires an operator to inspect the two fixed container names and run
the read-only plan before retrying.

Before DDL the workflow also rejects an active or unmasked
`sun-world-auto-deploy.timer`, an active auto-deploy service, an unsafe live
Nginx callback location or non-root-owned fixed snippet, Redis older than 6.2,
a non-production effective runtime, a provider matrix other than QQ enabled
with Google/WeChat disabled, wrong public API/Web origins, or failed QQ egress.
After scoped apply it silently requires the same exact QQ-only matrix in the
candidate `/auth/methods` response, then repeats that assertion through the
public API before ending API recovery coverage. These checks prove
configuration visibility, not a valid end-to-end QQ authorization code; the
real browser callback smoke remains mandatory.

For `target=api`, scoped success skips unrelated frontend-domain health checks.
For `target=all`, a later frontend start, local-health, or public-health failure
restores the old frontend but intentionally keeps the already-healthy new API;
the run is
reported failed. Retry only the frontend with `mode=deploy-existing`,
`target=web`, the same reviewed 40-character image tag, `schema_mode=full`, and
all identity-only acknowledgements left empty.

The commands below document the migration module interface. Run `check` and
`plan` freely in their documented modes, but do not invoke `apply` against
production while any API writer is online; the reviewed workflow supplies the
typed acknowledgement only after it has preserved, renamed, and stopped the
current Docker API container under the restore trap.

```bash
python -m src.database.mysql.identity_schema_migration --mode check
python -m src.database.mysql.identity_schema_migration --mode plan
python -m src.database.mysql.identity_schema_migration \
  --mode apply \
  --acknowledge 20260829_identity_schema
python -m src.database.mysql.identity_schema_migration --mode validate
```

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

During a full GitHub Actions deploy, the server runs the generic migration from
the new API image with the production secret env directory mounted read-only.
The reviewed identity mode uses the same mounts but substitutes its scoped
apply and validate pair. If the legacy backend config directory exists, the
deploy script also mounts it into the container at `/app/src/conf` so the
selected schema command and runtime see the same config files as the current
production service. The following is the full-mode equivalent:

```bash
API_MOUNTS=(
  -v /home/lighthouse/.config/blog_end:/home/lighthouse/.config/blog_end:ro
  -v /data/blog:/data/blog
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
  -e BLOG_RUNTIME_ENV=production
  -e BLOG_SECRET_ENV_FILE=/home/lighthouse/.config/blog_end/auth.env
  -e BLOG_CORS_ORIGINS=https://sunworld.site,https://www.sunworld.site,https://zsf.shopping,https://www.zsf.shopping
  -e AUTH_CSRF_ALLOWED_ORIGINS=https://sunworld.site,https://www.sunworld.site,https://api.sunworld.site
  -e BLOG_AUDIT_LOG_DIR=/data/blog/audit-logs
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
The CORS list may keep compatibility frontend domains, but the independent
CSRF list grants cookie-authenticated write authority only to the primary,
WWW, and API origins. Credentialed CORS rejects `*`, and production startup
requires `AUTH_REFRESH_REUSE_GRACE_SECONDS=0` (or the variable to be absent,
which has the same strict default).

## 验证 / Verification

```bash
curl -fsS http://127.0.0.1:8000/healthz
curl -fsS https://api.sunworld.site/healthz
```

## 示例文件 / Example File

`blog-api.service.example` 提供了未来 monorepo 路径的服务单元示例。
The example service unit shows the planned monorepo path.
