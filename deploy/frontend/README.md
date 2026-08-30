# Frontend Deploy

The frontend is deployed via Docker, container name `my-frontend`, host port
`8081`.

## Manual Deploy

```bash
cd /home/lighthouse/blog/sun-world
docker build --no-cache -t blog-front:latest .
docker rm -f my-frontend || true
docker run -d --restart unless-stopped --name my-frontend -p 8081:80 blog-front:latest
```

## Auto Deploy

The systemd timer `sun-world-auto-deploy.timer` auto-builds from `origin/main`
daily at 03:30 CST.

```bash
sudo systemctl status sun-world-auto-deploy.timer
sudo systemctl start sun-world-auto-deploy.service
sudo tail -100 /var/log/sun-world-auto-deploy.log
```

## GitHub Actions Deploy

`.github/workflows/deploy.yml` defines the GitHub Actions deployment pipeline.
It is the single GitHub Actions pipeline for quality checks and deployment.
Pull requests and non-documentation `main` pushes run `detect-changes` first,
then run only the relevant quality jobs before changed-target build and deploy
jobs. Manual production runs use
`workflow_dispatch`; choose the `main` branch when running them.
Documentation-only pushes are ignored, so they do not trigger the pipeline.
Workflow-only, deploy-doc, and local verification script changes still validate
formatting and deployment workflow shape, but they exit through `no-deploy`
instead of rebuilding production images.

Manual runs support three modes:

- `build-and-deploy`: build the selected target, then deploy it. Frontend
  `dist` is built and validated on the GitHub-hosted runner, then Lighthouse
  packages that exact current-run artifact into the frontend image. The API
  image is still built locally on Lighthouse.
- `build-only`: build the selected target without touching production. This
  leaves `sun-world-frontend:<git-sha>` and/or `sun-world-api:<git-sha>` on
  Lighthouse.
- `deploy-existing`: skip builds and deploy an existing image tag. For
  frontend and API this means an existing local Lighthouse image tag.

Manual runs also accept `target` as `all`, `web`, or `api`. The `image_tag`
input is required only for `deploy-existing`. `schema_mode` defaults to `full`,
which keeps the strict full-application schema apply. The reviewed
`identity-20260829` exception is available only when the target includes API
and `mode=deploy-existing` runs from `refs/heads/main`; the workflow rejects it
for `web`, `build-only`, `build-and-deploy`, or any other ref. It additionally
requires the current workflow SHA, selected image tag, and temporary repository
variable `IDENTITY_CUTOVER_ALLOWED_SHA` to be the same 40-character lowercase
SHA, plus exact manually typed `identity_schema_ack`,
`identity_maintenance_ack`, and `identity_timer_ack` values. Push and
pull-request events cannot select the scoped schema mode.

For the reviewed cutover, set `IDENTITY_CUTOVER_ALLOWED_SHA` to the exact
reviewed API commit before pushing it to `main`. A matching main/API push keeps
`schema_mode=full`, runs quality/build, and forces `deploy_needed=false`, so it
stages the reviewed server checkout and image without entering deploy. A
mismatched or unset variable leaves normal full/fail-closed push deployment
unchanged. Before exposing that commit on `main`, freeze pushes and record,
stop, disable, and `mask --runtime` the independent
`sun-world-auto-deploy.timer`; its service must also be inactive. After secret
import and candidate-image
preflight, use `deploy-existing` with the same SHA and the three exact
acknowledgement values. Clear the temporary variable immediately after success
or abandonment and restore the timer's recorded enabled/active states; see
`docs/deployment/2026-08-29-identity-ai-cutover.md` for the complete order.

The workflow uses one production concurrency group with
`cancel-in-progress: false`, so overlapping `main` or manual production runs
queue rather than interrupting an SSH deployment or schema maintenance window.
Keep `main` frozen during the reviewed identity cutover. The quality jobs each
have their normal 10/15-minute limits, while deploy reserves
60 minutes for scoped DDL, both API health phases, and rollback. Frontend Node,
pnpm, and Vite work runs on the GitHub-hosted runner; Lighthouse only performs a
lightweight Docker packaging step. The API image still builds on Lighthouse.
The remote deploy holds the same server lock for the whole cutover; normal SSH
HUP/INT/TERM invokes rollback, while a process kill or host reboot requires the
runbook's manual fixed-container inspection.

The pipeline is split by changed deploy target:

Build frontend image on Lighthouse and Build API image on Lighthouse remain the
two production image jobs, but only the API job performs a source build on the
server.

1. `detect-changes` checks the pushed or pull-request file list.
   For the exact reviewed main/API SHA only, it can select the no-deploy staging
   path described above.
2. `quality-common` checks formatting and GitHub Actions workflow protocols.
3. `quality-web` runs frontend, UI package, and contracts checks only when
   frontend-related files changed. For a build run, it also builds and validates
   `apps/web/dist`, writes a commit/run-bound manifest with file hashes and size
   totals, and uploads the compressed `dist` payload as
   `frontend-runtime-<git-sha>-<run-id>-<run-attempt>`.
4. `quality-api` runs API checks only when API-related files changed.
5. `build-web` runs only when frontend-related files changed. It downloads the
   exact named frontend artifact from the current workflow run, verifies its
   commit, run identity, manifest, hashes, counts, and byte totals, and transfers
   the compressed payload over SSH. SSH trusts only the reviewed ED25519 host
   key in `deploy/lighthouse_known_hosts`; it does not learn a host key from the
   live network. Lighthouse syncs `/home/lighthouse/blog/sun-world` to
   `origin/main`, repeats the checkout and artifact checks, and packages
   `sun-world-frontend:<git-sha>` with the reviewed runtime Dockerfile and Nginx
   config from that checkout.
6. `build-api` runs only when API-related files changed, SSHes to Lighthouse,
   syncs `/home/lighthouse/blog/sun-world` to `origin/main`, and builds
   `sun-world-api:<git-sha>` locally on the server with SSH keepalive enabled.
7. `build-web` and `build-api` use the same server-side lock while syncing the
   repo and packaging or building images, so simultaneous frontend/API changes
   do not race on the same checkout.
8. `deploy` waits for the required server-side image build(s).
9. If only frontend changed, deploy verifies the local frontend image and
   recreates `my-frontend` only.
10. If only API changed, deploy uses the local API image, runs the selected
   MySQL schema migration command, verifies a candidate container on port
   `18000`, then switches the persistent `sun-world-api` container onto port
   `8000`. The default is the strict full apply; the explicitly selected
   `identity-20260829` manual path runs only its acknowledged scoped apply and
   post-apply validate.
11. If both changed, both local images are built before the deploy job performs
   both switches in one server session. Full mode retains the normal order. In
   the scoped identity path, the workflow preserves and stops the active
   `sun-world-api` Docker container under a failure-restoring trap, finishes
   schema apply/validate, candidate/public QQ-only assertions, and local/public
   API health, and only then switches the frontend. The old frontend
   container is recorded and renamed as a rollback container; a new-container
   start, direct local port-8081 health, or public-frontend-health failure
   restores it while leaving the already healthy new API in place.
12. If no deployable files changed, the workflow exits through the `no-deploy`
   job. This includes changes limited to GitHub Actions workflow files,
   deployment docs, or local verification scripts.

Frontend images are tagged locally on Lighthouse from the runner-built,
current-run `dist` artifact:

```text
sun-world-frontend:<git-sha>
```

The server deploy step uses the `<git-sha>` tag so a specific deployment can be
audited or rolled back from an already-built local image. A missing cached
runtime base, checkout mismatch, artifact mismatch, unsafe archive, or image
packaging failure stops before the deploy job can switch `my-frontend`; the
currently running container remains in service.

The API image is built and tagged locally on Lighthouse:

```text
sun-world-api:<git-sha>
```

The API image is normally started by this workflow after
`python -m src.database.mysql.schema_migration --mode apply` succeeds. A
reviewed manual identity cutover may instead use
`schema_mode=identity-20260829`; that branch runs the exact acknowledged
identity migration and validates it without executing the generic apply. It
verifies the reviewed image, a live checkout clean across staged, unstaged,
and non-ignored untracked files, masked frontend
timer, root-owned callback snippet and effective OAuth callback log-safety,
Redis capability, effective production runtime, exact production API/Web
origins, the exact QQ-only registry, and QQ egress. It then renames and stops
the existing `sun-world-api` container and
arms a restore trap before DDL, eliminating the online username-write race. The
deploy job starts `sun-world-api-candidate` on port `18000`, silently checks
that QQ is enabled while Google and WeChat are disabled in `/auth/methods`,
starts the persistent `sun-world-api` container on host-network port `8000`, and verifies local/public
health plus the public QQ-only method matrix. Failure before that public matrix
restores the recorded Docker API container without starting disabled
`blog-api.service` and without touching the frontend. Existing incompatible
columns in the selected schema scope make the workflow fail rather than
rewriting data.

An API-only scoped run skips unrelated frontend-domain health checks. If an
`all` run reaches the frontend and its new container start, local port-8081
health, or public health fails, the old frontend is restored and the run fails,
but the already-healthy new API remains. Retry only the web image with
`mode=deploy-existing`, `target=web`, the
same 40-character image tag, `schema_mode=full`, and all identity-only
acknowledgements empty; do not rerun the scoped DDL. That exact manual Web-only
path records and renames the current healthy frontend before replacement, then
keeps it as `my-frontend-identity-backup` and restores it on a start, direct
port-8081, or public-domain failure. Do not use
`build-and-deploy` or a full `target=all` run for this retry.

The Lighthouse deploy user currently runs Docker through passwordless
`sudo docker`, so the workflow does not require the SSH user to be in the
`docker` group.

## Runner Artifact And Server Image Builds

GitHub Actions does not push production images through a remote registry. The
frontend job builds and validates `apps/web/dist` on the GitHub-hosted runner,
downloads only the exact artifact created by the current workflow run, and
transfers that small compressed payload over SSH. Lighthouse uses the already
cached `nginx:alpine` image and `deploy/frontend/Dockerfile.runtime` to package
the static files with `docker build --pull=false --network=none`; it does not run
Node, pnpm, or Vite for the production frontend image.

The SSH connection is pinned to the reviewed public ED25519 host key in
`deploy/lighthouse_known_hosts`. The workflow does not use `ssh-keyscan` to
trust whatever key the live connection presents.

This path does not require GitHub to push an image to Tencent TCR, and it does
not require Lighthouse to pull an image from GHCR. Lighthouse still needs Git
access: both image jobs retain `git fetch --prune origin main`,
`git pull --ff-only origin main`, a commit-SHA equality check, and clean-checkout
checks before using repository deployment files. The API image continues to be
built from source on Lighthouse.

The frontend and API build jobs share a server-side lock file at
`/tmp/sun-world-docker-build.lock` while syncing the repo and packaging or
building Docker images. When only one side changed, prefer manual runs with
`target=web` or `target=api` instead of `target=all`.

Frontend packaging fails closed. If the current-run artifact, manifest, file
hashes, commit/run binding, checked-out runtime files, or cached `nginx:alpine`
base cannot be verified, the workflow does not create a deployable frontend
image and does not replace the existing `my-frontend` container.

The first API build after a Dockerfile or dependency change may still be slow,
but later API source-only builds should reuse the Python dependency layer. The
API Dockerfile rewrites Debian apt sources to Tencent Cloud mirrors, installs
the `bash` runtime required by `apps/api/start.sh`, and uses Tencent's PyPI mirror to keep Lighthouse builds inside faster regional
networks.

## Required GitHub Variables

Configure these under GitHub repository settings as Variables:

```text
LIGHTHOUSE_HOST
LIGHTHOUSE_USER
LIGHTHOUSE_PORT
```

`LIGHTHOUSE_PORT` can be set to `22` for the default SSH port.

Optional GitHub Actions variables:

```text
VITE_BASE_URL
VITE_TELEMETRY_ENDPOINT
```

When unset, the workflow uses the production defaults:

```text
https://api.sunworld.site
https://api.sunworld.site/telemetry/events
```

## Required GitHub Secrets

Configure this under GitHub repository settings as a Secret:

```text
LIGHTHOUSE_SSH_KEY
```

The corresponding public ED25519 host-key record is committed at
`deploy/lighthouse_known_hosts` after out-of-band verification. Do not replace
it from live `ssh-keyscan` output during a deployment. Do not commit private SSH
keys, `.env` values, or server secrets to the repository.

The frontend runtime artifact is short-lived:

- `frontend-runtime-<git-sha>-<run-id>-<run-attempt>` is retained for three
  days and contains only the compressed, runner-built `dist` payload and its
  strict manifest. `build-web` downloads it by exact name from the same workflow
  run; artifacts from another run or attempt are not accepted.

Deployment metadata artifacts are retained for 30 days:

- `frontend-deploy-metadata-<git-sha>` keeps the frontend image tag, commit,
  dist archive hash/size, and manifest hash.
- `api-deploy-metadata-<git-sha>` keeps the API image tag and commit.

Each retained metadata artifact is tied to the commit-specific image tag written
by the job that actually ran.

Rollback example:

1. Open the `Deploy Sun World` workflow in GitHub Actions.
2. Select `Run workflow` on `main`.
3. Set `mode` to `deploy-existing`.
4. Set `target` to `web`, `api`, or `all`.
5. Set `image_tag` to the last known good commit SHA.

## Verification

```bash
curl -I https://sunworld.site
curl -I https://www.sunworld.site
```

## Browser Cache Policy

- Vite-generated files under `/assets/` include content hashes and are served
  with `Cache-Control: public, max-age=31536000, immutable`.
- HTML, extensionless routes, SSG pages, and unhashed public files are served
  with `Cache-Control: no-cache, must-revalidate`, so a browser validates the
  entry document before using it again.
- Missing `/assets/` files return `404` instead of falling back to
  `index.html`. This prevents an old lazy chunk URL from receiving HTML after
  a deployment.

After deployment, verify one entry URL, one current hashed asset, and one
missing hashed asset. The expected results are revalidation, immutable cache,
and `404`, respectively.

## Dockerfiles

The root `Dockerfile` remains the manual and Compose source-build path. The
GitHub Actions production path uses `deploy/frontend/Dockerfile.runtime`, which
contains only the Nginx runtime layer and copies the already-built `dist`
payload plus `deploy/frontend/nginx.conf` from the verified server checkout.

Production workflow flow:

1. The GitHub-hosted runner builds and validates `apps/web/dist`.
2. The exact current-run artifact is transferred over host-key-pinned SSH.
3. Lighthouse verifies the artifact and checkout, confirms that `nginx:alpine`
   is already cached, and packages with `--pull=false --network=none`.
4. Nginx serves the static files on port 80.

## Compose

The frontend is part of `docker-compose.yml` and can be built and run through
Docker Compose:

```bash
docker compose build frontend
docker compose up -d frontend
```

This keeps the same production container name and port mapping:

- Container: `my-frontend`
- Host port: `8081`
- Container port: `80`

When converting the existing manually started `my-frontend` container to
Compose ownership, plan the switch because Docker will not allow two containers
with the same name. The current change only documents and validates the Compose
path; it does not replace the running frontend by itself.

The API is also in Compose, but behind the explicit `api` profile and mapped to
`127.0.0.1:18000` by default. That staging port keeps current Nginx routing and
the production `sun-world-api` container on `127.0.0.1:8000` untouched.
