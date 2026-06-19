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
Pull requests run the `quality` job only. Non-documentation `main` pushes run
`quality` first, then continue to changed-target build and deploy jobs. Manual
production runs use `workflow_dispatch`; choose the `main` branch when running
them. Documentation-only pushes are ignored, so they do not trigger the
pipeline. Workflow-only, deploy-doc, and local verification script changes
still validate the deployment workflow shape, but they exit through `no-deploy`
instead of rebuilding production images.

Manual runs support three modes:

- `build-and-deploy`: build current ref images, push them to Tencent CCR, then
  deploy the selected target.
- `build-only`: build current ref images and push them to Tencent CCR without
  touching production.
- `deploy-existing`: skip builds and deploy an existing CCR image tag. Use this
  with a previous commit SHA when rolling back after a bad upgrade.

Manual runs also accept `target` as `all`, `web`, or `api`. The `image_tag`
input is required only for `deploy-existing`.

The workflow uses one production concurrency group with
`cancel-in-progress: true`, so if multiple `main` or manual production runs
overlap, the older in-progress run is canceled and the newest run wins. The
quality, frontend build, and deploy jobs each have a 15-minute timeout. The API
image build has a 30-minute timeout because the Python dependency layer is
larger and the first cache warm-up can take longer.

The pipeline is split by changed deploy target:

1. `quality` checks formatting, workflow protocol, frontend, API, UI package,
   and contracts.
2. `detect-changes` checks the pushed file list after `quality` passes.
3. `build-web` runs only when frontend-related files changed.
4. `build-api` runs only when API-related files changed.
5. Each build job pushes a commit-specific Docker image to Tencent CCR.
6. `deploy` waits for the required pushed images, SSHes to Lighthouse, and runs
   `docker pull` from Tencent CCR on the server.
7. If only frontend changed, deploy pulls and recreates `my-frontend` only.
8. If only API changed, deploy pulls the API image and runs only the MySQL
   schema migration command.
9. If both changed, both images are pushed before the deploy job
   performs the frontend switch and API schema apply in one server session.
10. If no deployable files changed, the workflow exits through the `no-deploy`
   job. This includes changes limited to GitHub Actions workflow files,
   deployment docs, or local verification scripts.

Frontend images are tagged in Tencent CCR with the commit SHA:

```text
ccr.ccs.tencentyun.com/<namespace>/sun-world-frontend:<git-sha>
```

The server deploy step uses the `<git-sha>` tag so a specific deployment can be
audited or rolled back from the registry.

The API image is also tagged in Tencent CCR:

```text
ccr.ccs.tencentyun.com/<namespace>/sun-world-api:<git-sha>
```

The API image is not started by this workflow. It is used to run
`python -m src.database.mysql.schema_migration --mode apply` on the server, so
new backend builds can add missing MySQL tables or columns before a later API
cutover. Existing incompatible columns make the workflow fail rather than
rewriting data.

The Lighthouse deploy user currently runs Docker through passwordless
`sudo docker`, so the workflow does not require the SSH user to be in the
`docker` group.

## Image Registry

GitHub Actions pushes application images to Tencent Cloud Container Registry
personal edition at `ccr.ccs.tencentyun.com`. Lighthouse is already logged in to
the registry with Docker, so deployment only needs to run `sudo docker pull`
for the changed commit-specific image tags. This avoids long cross-border image
archive uploads from GitHub Actions to the server.

Frontend and API image builds also use Tencent CCR registry cache tags:

```text
ccr.ccs.tencentyun.com/<namespace>/sun-world-frontend:buildcache
ccr.ccs.tencentyun.com/<namespace>/sun-world-api:buildcache
```

The first API build after a Dockerfile or dependency change may still be slow,
but later API source-only builds should reuse the Python dependency layer.

## Required GitHub Variables

Configure these under GitHub repository settings as Variables:

```text
LIGHTHOUSE_HOST
LIGHTHOUSE_USER
LIGHTHOUSE_PORT
TENCENT_CCR_REGISTRY
TENCENT_CCR_NAMESPACE
TENCENT_CCR_USERNAME
```

`LIGHTHOUSE_PORT` can be set to `22` for the default SSH port.
`TENCENT_CCR_REGISTRY` can be `ccr.ccs.tencentyun.com`.

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
TENCENT_CCR_PASSWORD
```

Do not commit SSH keys, `.env` values, or server secrets to the
repository.

Artifacts are retained for 30 days:

- `frontend-dist-<git-sha>` keeps the generated `apps/web/dist` output.
- `frontend-deploy-metadata-<git-sha>` keeps the image tag, commit, build
  manifest, and build summary.
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

The frontend can also be built and run through Docker Compose:

```bash
docker compose build frontend
docker compose up -d frontend
```

This keeps the same production container name and port mapping:

- Container: `my-frontend`
- Host port: `8081`
- Container port: `80`
