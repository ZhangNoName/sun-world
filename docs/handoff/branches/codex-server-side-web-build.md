## Branch Handoff: codex/server-side-web-build

## Current Goal

Move frontend Docker image builds from GitHub Buildx/Tencent CCR push to
Lighthouse-local Docker builds, matching the API build path, so frontend deploys
are not blocked by registry cache export timeouts. Also make the deployment
pipeline detect changed targets before running quality checks, then run only the
relevant common/frontend/API checks.

## Status

- Implemented locally on branch `codex/server-side-web-build`.
- PR #5 was merged to `main` as `e10c100f`, but the main deployment workflow was
  cancelled twice in `Build and push frontend image`.
- Logs showed the frontend image manifest pushed, then BuildKit registry cache
  export stalled and the job was cancelled before deploy could run.
- `.github/workflows/deploy.yml` now builds `sun-world-frontend:<commit>` on
  Lighthouse over SSH.
- `build-web` and `build-api` share `/tmp/sun-world-docker-build.lock` while
  syncing `/home/lighthouse/blog/sun-world` and building images.
- Deploy now verifies the local frontend image instead of pulling a remote
  registry image.
- Deployment protocol checks and docs now require the Lighthouse-local image
  path and reject Buildx registry cache export.
- `detect-changes` now runs first for PRs, pushes, and manual runs.
- `quality-common` handles formatting and workflow protocol checks.
- `quality-web` runs only when frontend/shared web files changed.
- `quality-api` runs only when API/shared contract files changed.
- `build-web` and `build-api` wait for the relevant split quality jobs before
  running server-side Docker builds.

## Important Files Touched

- `.github/workflows/deploy.yml`
- `scripts/check-github-actions-deploy.mjs`
- `deploy/frontend/README.md`
- `docs/current-state.md`
- `docs/agent-handoff.md`
- `docs/handoff/branches/codex-server-side-web-build.md`

## Commands Run

- `pnpm check:github-actions:deploy`
- `pnpm check:github-actions:ci`
- `pnpm format`
- `pnpm format:check`
- `git diff --check`

## Verification Result

- Deploy protocol check passed.
- CI protocol check passed.
- Format check passed.
- `git diff --check` passed with Windows CRLF conversion warnings only.

## Blockers

- None known locally.

## Next Suggested Step

Run deploy protocol checks, format checks, commit, push, and open/merge a small
PR to `main`; then confirm the main deployment workflow completes and the public
frontend updates.
