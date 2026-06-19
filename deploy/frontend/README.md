# Frontend Deploy

The frontend runs in Docker as container `my-frontend` on host port `8081`.

## GitHub Actions

`.github/workflows/deploy-frontend.yml` deploys the frontend through GitHub
Actions. It runs on every `main` branch push and can also be run manually with
`workflow_dispatch`; choose the `main` branch for manual production deploys.

The workflow uses `concurrency` with `cancel-in-progress: true`, so if multiple
`main` changes arrive while a deploy is still running, the older in-progress run
is canceled and the newest commit wins.

The pipeline:

1. installs dependencies with pnpm,
2. builds the frontend,
3. uploads the generated frontend `dist` directory as an artifact,
4. uploads deployment metadata as an artifact,
5. builds and pushes `ghcr.io/zhangnoname/sun-world-frontend`,
6. SSHes to the Lighthouse server,
7. pulls the commit-specific image tag,
8. recreates the `my-frontend` container,
9. verifies `https://sunworld.site` and `https://www.sunworld.site`.

Images are pushed with both tags:

```text
ghcr.io/zhangnoname/sun-world-frontend:<git-sha>
ghcr.io/zhangnoname/sun-world-frontend:latest
```

The server deploy step uses the `<git-sha>` tag instead of `latest` so a
specific deployment can be audited or rolled back.

## Required GitHub Variables

Configure these under GitHub repository settings:

```text
LIGHTHOUSE_HOST
LIGHTHOUSE_USER
LIGHTHOUSE_PORT
```

`LIGHTHOUSE_PORT` can be set to `22` for the default SSH port.

## Required GitHub Secrets

Configure this under GitHub repository settings:

```text
LIGHTHOUSE_SSH_KEY
```

Do not commit SSH keys, GHCR tokens, `.env` values, or server secrets to the
repository.

GitHub Actions publishes to GHCR with the built-in `GITHUB_TOKEN` and requires
workflow package write permission. The server must already be able to pull the
GHCR image, for example through a prior `docker login ghcr.io`.

Artifacts are retained for 30 days:

- `frontend-dist-<git-sha>` keeps the generated frontend dist output.
- `frontend-deploy-metadata-<git-sha>` keeps the image tag and commit.

## Verification

```bash
curl -I https://sunworld.site
curl -I https://www.sunworld.site
```
