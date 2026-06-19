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

`.github/workflows/deploy-frontend.yml` defines the GitHub Actions frontend
deployment pipeline. It runs on every `main` branch push and can also be run
manually with `workflow_dispatch`; choose the `main` branch for manual
production deploys.

The workflow uses `concurrency` with `cancel-in-progress: true`, so if multiple
`main` changes arrive while a deploy is still running, the older in-progress run
is canceled and the newest commit wins.

The pipeline is split by changed deploy target:

1. `detect-changes` checks the pushed file list.
2. `build-web` runs only when frontend-related files changed.
3. `build-api` runs only when API-related files changed.
4. `deploy` waits for the required image builds, then opens one SSH session to
   the Lighthouse server.
5. If only frontend changed, deploy pulls and recreates `my-frontend` only.
6. If only API changed, deploy pulls the API image and runs only the MySQL
   schema migration command.
7. If both changed, both images are built first, then the deploy job performs
   the frontend switch and API schema apply in one server session.
8. If no deployable files changed, the workflow exits through the `no-deploy`
   job.

Frontend images are pushed with both tags:

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

The Lighthouse deploy user currently runs Docker through passwordless
`sudo docker`, so the workflow does not require the SSH user to be in the
`docker` group.

## Tencent Cloud TCR And Docker Mirror

The workflow always pushes images to GHCR. If Tencent Cloud Container Registry
variables and secrets are configured, it also pushes the same commit and
`latest` tags to TCR, and the server deploy step prefers the TCR image tags.
This is the recommended production pull path because the Lighthouse server is
also on Tencent Cloud.

Tencent Cloud's Docker mirror
`https://mirror.ccs.tencentyun.com` is a separate one-time server Docker daemon
setting. It accelerates DockerHub image downloads from Tencent Cloud intranet,
but it does not mirror private GHCR images. Use both:

- TCR for Sun World application images.
- Tencent Cloud Docker mirror for DockerHub base image pulls on the server.

One-time server mirror configuration:

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json >/dev/null <<'JSON'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com"
  ]
}
JSON
sudo systemctl restart docker
sudo docker info
```

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
TCR_REGISTRY
TCR_FRONTEND_IMAGE_NAME
TCR_API_IMAGE_NAME
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

Optional Tencent Cloud Container Registry secrets:

```text
TCR_USERNAME
TCR_PASSWORD
```

When all TCR variables and secrets are present, the workflow pushes to TCR and
the Lighthouse deploy pulls from TCR. When any TCR value is missing, the
workflow falls back to GHCR only.

Do not commit SSH keys, GHCR tokens, `.env` values, or server secrets to the
repository.

GitHub Actions publishes to GHCR with the built-in `GITHUB_TOKEN` and requires
workflow package write permission. The server must already be able to pull the
GHCR image, for example through a prior `docker login ghcr.io`.

Artifacts are retained for 30 days:

- `frontend-dist-<git-sha>` keeps the generated `apps/web/dist` output.
- `frontend-deploy-metadata-<git-sha>` keeps the image tag, commit, build
  manifest, and build summary.
- `api-deploy-metadata-<git-sha>` keeps the API image tag and commit.

Each retained artifact is tied to the commit-specific image tag written by the
job that actually ran.

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
