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
