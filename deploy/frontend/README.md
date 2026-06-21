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
  and API images are built locally on Lighthouse.
- `build-only`: build the selected target without touching production. This
  leaves `sun-world-frontend:<git-sha>` and/or `sun-world-api:<git-sha>` on
  Lighthouse.
- `deploy-existing`: skip builds and deploy an existing image tag. For
  frontend and API this means an existing local Lighthouse image tag.

Manual runs also accept `target` as `all`, `web`, or `api`. The `image_tag`
input is required only for `deploy-existing`.

The workflow uses one production concurrency group with
`cancel-in-progress: true`, so if multiple `main` or manual production runs
overlap, the older in-progress run is canceled and the newest run wins. The
quality and deploy jobs each have a 15-minute timeout. The frontend and API
image build jobs have 30-minute timeouts because they build Docker images on
Lighthouse.

The pipeline is split by changed deploy target:

Build frontend image on Lighthouse and Build API image on Lighthouse are the
two production image build jobs.

1. `detect-changes` checks the pushed or pull-request file list.
2. `quality-common` checks formatting and GitHub Actions workflow protocols.
3. `quality-web` runs frontend, UI package, and contracts checks only when
   frontend-related files changed.
4. `quality-api` runs API checks only when API-related files changed.
5. `build-web` runs only when frontend-related files changed, SSHes to
   Lighthouse, syncs `/home/lighthouse/blog/sun-world` to `origin/main`, and
   builds `sun-world-frontend:<git-sha>` locally on the server.
6. `build-api` runs only when API-related files changed, SSHes to Lighthouse,
   syncs `/home/lighthouse/blog/sun-world` to `origin/main`, and builds
   `sun-world-api:<git-sha>` locally on the server with SSH keepalive enabled.
7. `build-web` and `build-api` use the same server-side lock while syncing the
   repo and building images, so simultaneous frontend/API changes do not race
   on the same checkout.
8. `deploy` waits for the required server-side image build(s).
9. If only frontend changed, deploy verifies the local frontend image and
   recreates `my-frontend` only.
10. If only API changed, deploy uses the local API image, runs the MySQL schema
   migration command, verifies a candidate container on port `18000`, then
   switches the persistent `sun-world-api` container onto port `8000`.
11. If both changed, both local images are built before the deploy job performs
   the frontend switch and persistent API
   container switch in one server session.
12. If no deployable files changed, the workflow exits through the `no-deploy`
   job. This includes changes limited to GitHub Actions workflow files,
   deployment docs, or local verification scripts.

Frontend images are built and tagged locally on Lighthouse:

```text
sun-world-frontend:<git-sha>
```

The server deploy step uses the `<git-sha>` tag so a specific deployment can be
audited or rolled back from an already-built local image.

The API image is built and tagged locally on Lighthouse:

```text
sun-world-api:<git-sha>
```

The API image is started by this workflow after
`python -m src.database.mysql.schema_migration --mode apply` succeeds. The
deploy job first starts `sun-world-api-candidate` on port `18000` and checks
`/healthz`; after that passes, it stops/disables `blog-api.service`, starts the
persistent `sun-world-api` container on host-network port `8000`, and verifies
both local and public health. Existing incompatible MySQL columns make the
workflow fail rather than rewriting data.

The Lighthouse deploy user currently runs Docker through passwordless
`sudo docker`, so the workflow does not require the SSH user to be in the
`docker` group.

## Server-Side Image Builds

GitHub Actions does not push production images through a remote registry. The
workflow SSHes to Lighthouse and runs Docker builds in
`/home/lighthouse/blog/sun-world` for both frontend and API changes. This avoids
the GitHub-to-registry export path that repeatedly timed out during frontend
BuildKit cache export.

The frontend and API build jobs share a server-side lock file at
`/tmp/sun-world-docker-build.lock` while syncing the repo and building Docker
images. When only one side changed, prefer manual runs with `target=web` or
`target=api` instead of `target=all`.

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

Do not commit SSH keys, `.env` values, or server secrets to the
repository.

Artifacts are retained for 30 days:

- `frontend-deploy-metadata-<git-sha>` keeps the frontend image tag and commit.
- `api-deploy-metadata-<git-sha>` keeps the API image tag and commit.

Each retained artifact is tied to the commit-specific image tag written by the
job that actually ran.

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

## Dockerfile

The root `Dockerfile` is the frontend image build source.

Build flow:

1. Node 22 image installs pnpm and builds `apps/web`.
2. `apps/web/dist` is copied into the Nginx Alpine image.
3. Nginx serves static files on port 80.

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
