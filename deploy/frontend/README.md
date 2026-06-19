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
It runs on non-documentation `main` branch pushes and can also be run manually
with `workflow_dispatch`; choose the `main` branch for manual production
deploys. Documentation-only pushes are ignored.

The workflow uses `concurrency` with `cancel-in-progress: true`, so if multiple
`main` changes arrive while a deploy is still running, the older in-progress run
is canceled and the newest commit wins.

The pipeline is split by changed deploy target:

1. `detect-changes` checks the pushed file list.
2. `build-web` runs only when frontend-related files changed.
3. `build-api` runs only when API-related files changed.
4. Each build job creates a local Docker image and saves it as a compressed
   artifact instead of pushing it to a registry.
5. `deploy` waits for the required image artifacts, downloads them inside
   GitHub Actions, copies them to Lighthouse with `scp`, then runs `docker load`
   on the server.
6. If only frontend changed, deploy loads and recreates `my-frontend` only.
7. If only API changed, deploy loads the API image and runs only the MySQL
   schema migration command.
8. If both changed, both image artifacts are ready before the deploy job
   performs the frontend switch and API schema apply in one server session.
9. If no deployable files changed, the workflow exits through the `no-deploy`
   job.

Frontend images are tagged locally with the commit SHA:

```text
sun-world-frontend:<git-sha>
```

The server deploy step uses the `<git-sha>` tag so a specific deployment can be
audited or rolled back from retained artifacts.

The API image is also tagged locally:

```text
sun-world-api:<git-sha>
```

The API image is not started by this workflow. It is used to run
`python -m src.database.mysql.schema_migration --mode apply` on the server, so
new backend builds can add missing MySQL tables or columns before a later API
cutover. Existing incompatible columns make the workflow fail rather than
rewriting data.

The Lighthouse deploy user currently runs Docker through passwordless
`sudo docker`, so the workflow does not require the SSH user to be in the
`docker` group.

## Image Transfer

The deploy job intentionally does not pull application images from a registry.
Server-side registry pulls were too slow from Lighthouse. GitHub Actions now
keeps `frontend-image-<git-sha>` and `api-image-<git-sha>` artifacts, transfers
the changed archive files over SSH, and runs `sudo docker load -i ...` on the
server.

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

- `frontend-dist-<git-sha>` keeps the generated `apps/web/dist` output.
- `frontend-deploy-metadata-<git-sha>` keeps the image tag, commit, build
  manifest, and build summary.
- `frontend-image-<git-sha>` keeps the compressed frontend Docker image
  archive.
- `api-deploy-metadata-<git-sha>` keeps the API image tag and commit.
- `api-image-<git-sha>` keeps the compressed API Docker image archive.

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
