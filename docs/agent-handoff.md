## Current Handoff

- Latest task addendum (2026-06-20, P1.67 legacy schema type exceptions):
  - Goal: let API schema apply tolerate known existing production schema
    differences without rewriting those columns.
  - Root cause:
    - After config mounting and integer normalization were fixed, production
      schema validation reached two real legacy differences:
      `resources.type` is `tinyint` while the monorepo contract expects
      `varchar`, and `blog.category` is `varchar(255)` while the contract
      expects `int`.
    - The migration is conservative and should not rewrite existing columns;
      these known differences should be skipped explicitly rather than blocking
      unrelated missing-table/missing-column creation.
  - Status: committed and pushed to `main` as
    `7c5d3a1f ci: tolerate known legacy mysql schema types`. GitHub Actions
    run `27856345448` completed successfully, including API image build/push
    and schema apply on Lighthouse.
  - Important files touched:
    - `apps/api/src/database/mysql/schema_migration.py`
    - `scripts/check-api-schema-types.py`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - `LEGACY_COMPATIBLE_COLUMN_TYPES` declares the allowed legacy differences.
    - The migration still fails on other incompatible existing column types.
    - `pnpm check:api` verifies the allowed cases and a negative case.

- Latest task addendum (2026-06-20, P1.66 schema type compatibility):
  - Goal: allow the conservative schema migration guard to validate the
    existing production MySQL schema.
  - Root cause:
    - After production config mounts started working, schema migration reached
      MySQL and failed on existing primary key columns such as
      `bigint unsigned` while the target contract expected `int`.
    - This is a compatible integer widening for the current guard's purpose;
      it should not block adding missing tables/columns.
  - Status: committed and pushed to `main` as
    `3ece5a19 ci: allow compatible mysql integer types`. This exposed the
    known legacy schema type differences documented in P1.67.
  - Important files touched:
    - `apps/api/src/database/mysql/schema_migration.py`
    - `scripts/check-api-schema-types.py`
    - `scripts/run-api-check.mjs`
    - `docs/agent-handoff.md`
  - Behavior:
    - MySQL type normalization now strips `unsigned` and `zerofill`
      qualifiers before comparing base types.
    - `pnpm check:api` now verifies representative compatible and
      incompatible schema type cases.

- Latest task addendum (2026-06-20, P1.65 API schema deploy config mount):
  - Goal: fix the deploy failure after API build/push and Docker path
    detection succeeded, but schema migration connected to MySQL with the
    default checked-in local config.
  - Root cause:
    - The transient API container only mounted the single `auth.env` file at a
      synthetic `/run/blog_end/auth.env` path.
    - Production runtime config may also depend on paths under
      `/home/lighthouse/.config/blog_end` or untracked files in the legacy
      `/home/lighthouse/blog/blog_end/src/conf` directory.
    - Without those read-only mounts, schema migration fell back to checked-in
      `local.yml` defaults and MySQL rejected the connection.
  - Status: committed and pushed to `main` as
    `263a78b5 ci: mount api legacy config directory`. This fixed production
    config loading for the transient schema-apply container.
  - Important files touched:
    - `.github/workflows/deploy.yml`
    - `scripts/check-api-deploy-schema.mjs`
    - `deploy/backend/README.md`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - API schema apply now mounts `/home/lighthouse/.config/blog_end` read-only
      at the same absolute path inside the container and sources
      `/home/lighthouse/.config/blog_end/auth.env`.
    - If the legacy backend `src/conf` directory exists, it is mounted
      read-only into `/app/src/conf`.
    - No secret values are printed or committed.

- Latest task addendum (2026-06-20, P1.64 API schema migration Docker path fix):
  - Goal: fix the follow-up deploy failure after the API image built and
    pushed successfully but schema migration crashed inside the Docker image.
  - Root cause:
    - `schema_migration.py` assumed the monorepo source layout and resolved
      config paths through `Path(__file__).resolve().parents[5]`.
    - Inside the API Docker image, the application root is `/app`, so
      `/app/src/database/mysql/schema_migration.py` does not have five parent
      levels. The deploy job failed with `IndexError: 5`.
  - Status: committed and pushed to `main` as
    `b1bff947 ci: refresh api poetry lock`. The next GitHub Actions run
    proved API image build/push was fixed, then exposed a separate Docker image
    path issue in schema migration; see P1.64 above.
  - Important files touched:
    - `apps/api/src/database/mysql/schema_migration.py`
    - `scripts/check-api-schema-config-path.py`
    - `scripts/run-api-check.mjs`
    - `scripts/check-api-deploy-schema.mjs`
    - `docs/agent-handoff.md`
  - Behavior:
    - Schema migration now discovers the API root by walking upward until it
      finds `src/conf` and `main.py`, which supports both the monorepo
      `apps/api` layout and the Docker `/app` layout. The final API image does
      not copy `pyproject.toml`, so the root sentinel must use files present in
      the runtime image.
    - `pnpm check:api` now includes a path-resolution regression check that
      simulates the Docker image layout.
    - The deploy schema protocol rejects the old hard-coded `parents[5]`
      path assumption.
  - Verification:
    - The failed run `27855322675` proved the API image build/push was fixed
      and that TCR pull to Lighthouse was fast; deploy then failed in schema
      migration path resolution.
    - `pnpm check:api:deploy-schema` passed.
    - `python apps\api\src\database\mysql\schema_migration.py --mode check`
      passed.
    - `pnpm check:api` passed, including
      `scripts/check-api-schema-config-path.py`.
    - `pnpm check:github-actions:deploy` passed.
    - `pnpm check:compose` passed through static validation; local Docker CLI
      is unavailable.

- Latest task addendum (2026-06-20, P1.63 API Docker export lock fix):
  - Goal: fix the failed `build-api` GitHub Actions job after the API
    Dockerfile started exporting locked Poetry requirements during image
    build.
  - Root cause:
    - `apps/api/poetry.lock` was stale relative to `apps/api/pyproject.toml`.
    - The previous Dockerfile did not run `poetry export`, so the mismatch was
      latent until P1.62 introduced the dependency-cache requirements stage.
  - Status: committed and pushed to `main` as
    `4f1985d7 ci: support api schema migration in docker`, followed by
    `4471bfd7 ci: use runtime files for api root detection`.
  - Important files touched:
    - `apps/api/poetry.lock`
    - `docs/agent-handoff.md`
  - Behavior:
    - `poetry export --only main --format requirements.txt --without-hashes`
      now succeeds from `apps/api`, matching the Dockerfile build step.
  - Verification:
    - `python -m poetry export --only main --format requirements.txt --without-hashes --output "$env:TEMP\sun-world-api-requirements.txt"`
      first reproduced the CI failure with the stale-lock message.
    - `python -m poetry lock` refreshed the lock file.
    - The same `poetry export` command passed after refreshing the lock.
    - `pnpm check:api-dockerfile` passed.
    - `pnpm check:github-actions:deploy` passed.
    - `pnpm check:compose` passed through static validation; local Docker CLI
      is unavailable.
    - `pnpm check:api` passed.
    - `pnpm format:check` passed.
    - `git diff --check` passed.

- Latest task addendum (2026-06-20, P1.62 API Dockerfile cache optimization):
  - Goal: reduce repeated API image build time by separating Python dependency
    installation from API source-copy layers and enabling registry-backed
    Docker build cache.
  - Status: committed and pushed to `main` as
    `bf0e977a ci: cache api docker dependencies`. The first GitHub Actions
    run failed in `build-api` because the API Poetry lock file was stale; see
    P1.63 above for the follow-up fix.
  - Important files touched:
    - `apps/api/Dockerfile`
    - `.github/workflows/deploy.yml`
    - `scripts/check-api-dockerfile-cache.mjs`
    - `scripts/check-github-actions-deploy.mjs`
    - `package.json`
    - `deploy/frontend/README.md`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - API Docker builds now generate a locked `requirements.txt` from
      Poetry metadata in a requirements stage.
    - The final API image installs `requirements.txt` before copying `src`.
      Source-only API changes should no longer force a full Python dependency
      reinstall layer.
    - `pnpm check:compose` now includes the API Dockerfile cache guard.
    - Frontend and API Docker builds use Tencent CCR `:buildcache` registry
      cache tags.
    - API image build timeout is 30 minutes; quality, frontend build, and
      deploy jobs stay at 15 minutes.
  - Verification:
    - `pnpm check:api-dockerfile` first failed on the old Dockerfile because
      dependency installation happened after source copy.
    - `pnpm check:api-dockerfile` passed after the Dockerfile rewrite.
    - `pnpm check:compose` passed through static validation; local Docker CLI
      is unavailable, so no local image build was run.
    - `pnpm check:api` passed.

- Latest task addendum (2026-06-20, P1.61 single GitHub pipeline timeout):
  - Goal: collapse CI and deploy into one GitHub Actions workflow and keep
    stuck deploys from occupying the production pipeline for too long.
  - Status: implementation in progress locally; not committed yet.
  - Important files touched:
    - `.github/workflows/deploy.yml`
    - `.github/workflows/ci.yml`
    - `scripts/check-github-actions-ci.mjs`
    - `scripts/check-github-actions-deploy.mjs`
    - `deploy/frontend/README.md`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - `.github/workflows/ci.yml` is removed. `Deploy Sun World` is now the
      single GitHub Actions pipeline.
    - Pull requests run only the `quality` job. Main pushes run `quality`,
      then changed-target build/deploy jobs. Manual `deploy-existing` skips
      quality and builds so it can redeploy a known-good image tag quickly.
    - Production runs share one fixed concurrency group,
      `deploy-sun-world-production`, with `cancel-in-progress: true`.
    - Quality, build, and deploy jobs are capped at 15 minutes.
  - Verification:
    - `pnpm check:github-actions:ci` passed.
    - `pnpm check:github-actions:deploy` passed.
    - `pnpm check:api:deploy-schema` passed.
    - `pnpm format:check` passed after running `pnpm format` on the changed
      workflow/guard files.
    - Python/PyYAML parsed `.github/workflows/deploy.yml`.
    - `node --check` passed for the modified GitHub Actions guard scripts.
    - `git diff --check` passed with Windows CRLF conversion warnings only.

- Latest task addendum (2026-06-20, P1.60 Tencent CCR deploy path):
  - Goal: replace slow GitHub Actions to Lighthouse image archive uploads with
    Tencent CCR personal edition push/pull, and allow manual rollback to a
    previous known-good image tag.
  - Status: implemented locally; not committed yet.
  - Important files touched:
    - `.github/workflows/deploy.yml`
    - `scripts/check-github-actions-deploy.mjs`
    - `scripts/check-api-deploy-schema.mjs`
    - `deploy/frontend/README.md`
    - `deploy/backend/README.md`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - Automatic deploy now runs through `workflow_run` only after the `CI`
      workflow succeeds on `main`.
    - GitHub Actions logs in to Tencent CCR personal edition and pushes
      commit-SHA frontend/API image tags under
      `ccr.ccs.tencentyun.com/<namespace>/...`.
    - Lighthouse no longer receives image tar archives from GitHub Actions.
      The deploy job SSHes to the server and runs `sudo docker pull` for the
      changed CCR images.
    - Manual deploy supports `build-and-deploy`, `build-only`, and
      `deploy-existing`. `deploy-existing` requires `image_tag` and can restore
      a previous known-good frontend/API image without rebuilding.
    - API behavior is unchanged: the API image is only used for
      `schema_migration --mode apply`; it does not start the API container,
      change Nginx, or restart `blog-api.service`.
  - Required configuration:
    - GitHub Variables: `TENCENT_CCR_REGISTRY`,
      `TENCENT_CCR_NAMESPACE`, `TENCENT_CCR_USERNAME`, plus existing
      Lighthouse SSH variables.
    - GitHub Secret: `TENCENT_CCR_PASSWORD`, plus existing
      `LIGHTHOUSE_SSH_KEY`.
    - Server Docker login has already succeeded for
      `ccr.ccs.tencentyun.com`.
  - Verification:
    - `pnpm check:github-actions:deploy` passed.
    - `pnpm check:api:deploy-schema` passed.
    - `pnpm check:github-actions:ci` passed.
    - `pnpm format:check` passed after running `pnpm format` on changed
      Prettier-supported workflow/script files.
    - Python/PyYAML parsed `.github/workflows/ci.yml` and
      `.github/workflows/deploy.yml`.
    - `node --check` passed for the modified GitHub Actions guard scripts.
    - `git diff --check` passed with Windows CRLF conversion warnings only.

- Latest task addendum (2026-06-19, P1.59 no-registry deployment path):
  - Goal: remove the GHCR/TCR server pull path because Lighthouse deployment
    was spending 40+ minutes retrying GHCR layer downloads.
  - Status: pushed to `main`. Follow-up commit added docs-only push skipping
    and workflow-only no-deploy behavior.
  - Important files touched:
    - `.github/workflows/deploy.yml`
    - `scripts/check-github-actions-deploy.mjs`
    - `scripts/check-api-deploy-schema.mjs`
    - `deploy/frontend/README.md`
    - `deploy/backend/README.md`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - `.github/workflows/ci.yml` and `.github/workflows/deploy.yml` ignore
      documentation-only push changes through `paths-ignore`; manual dispatch
      remains available.
    - Workflow-only, deploy-doc, and local verification script changes still
      validate `.github/workflows/deploy.yml`, but they are not deploy targets
      and exit through `no-deploy` instead of rebuilding and transferring
      production images.
    - GitHub Actions still builds frontend and API images in CI.
    - Image tags are local commit-SHA tags:
      `sun-world-frontend:<git-sha>` and `sun-world-api:<git-sha>`.
    - Build jobs save compressed image archives as retained artifacts:
      `frontend-image-<git-sha>` and `api-image-<git-sha>`.
    - The deploy job downloads only changed image artifacts, copies them to
      Lighthouse with `scp`, runs `docker load`, and then switches the changed
      target(s).
    - The workflow intentionally avoids GHCR/TCR application-image push/pull,
      `docker login`, and server-side `docker pull`.
    - API behavior is unchanged: the API image is only used for
      `schema_migration --mode apply`; it does not start the API container,
      change Nginx, or restart `blog-api.service`.
  - Reference context:
    - The user's Tencent deployment docs recommend TCR as the best long-term
      solution. Since this project does not currently have TCR, the artifact
      transfer path is the practical fallback that preserves the key principle:
      build in CI, do not build on the server, and avoid cross-registry pulls.
  - Verification:
    - Read the user's reference docs:
      `腾讯云部署加速方案.md` and `流水线部署流程.md`.
    - `gh run cancel 27832982559` submitted cancellation for the old
      GHCR-pull deploy run.
    - The first no-registry deploy run showed image artifact sizes around
      30 MB for frontend and 128 MB for API. The server upload step became the
      next bottleneck when both images were transferred for a workflow-only
      commit, so workflow-only pushes now skip deployment.
    - `pnpm format` passed and did not need to change formatted files after
      the no-registry rewrite.
    - `pnpm format:check` passed on changed Prettier-supported files.
    - `pnpm check:github-actions:deploy` passed and now rejects registry
      push/pull deployment paths.
    - `pnpm check:api:deploy-schema` passed and now verifies API schema apply
      uses the loaded local image artifact.
    - Python/PyYAML parsed `.github/workflows/ci.yml` and
      `.github/workflows/deploy.yml`.
    - `node --check` passed for the modified deploy/schema/format guard
      scripts.
    - `pnpm check` passed all 12 checks. Docker CLI remains unavailable
      locally, so compose validation stayed on the existing static path and no
      deployment command was run.

- Latest task addendum (2026-06-19, P1.58 CI and formatting baseline):
  - Goal: rename the deployment workflow now that it deploys more than the
    frontend, add a local executable formatting baseline, and add a CI workflow
    for format checks and unit checks without committing yet.
  - Status: implementation in progress locally; the user explicitly asked not
    to commit this checkpoint yet.
  - Important files touched:
    - `.github/workflows/deploy.yml`
    - `.github/workflows/ci.yml`
    - `.prettierrc.json`
    - `.prettierignore`
    - `scripts/check-github-actions-ci.mjs`
    - `scripts/check-github-actions-deploy.mjs`
    - `scripts/check-all.mjs`
    - `package.json`
    - `pnpm-lock.yaml`
    - `deploy/frontend/README.md`
    - `docs/current-state.md`
    - `docs/engineering-conventions.md`
  - Behavior:
    - The deployment workflow file is renamed from
      `.github/workflows/deploy-frontend.yml` to `.github/workflows/deploy.yml`
      and shown in GitHub Actions as `Deploy Sun World`.
    - Prettier is the first formatting baseline for JS/TS/Vue/JSON/YAML/CSS/SCSS.
      `scripts/format-changed.mjs` targets changed supported files only so this
      checkpoint does not reformat historical code in bulk. Markdown and Python
      are intentionally excluded until they receive focused baselines.
    - `.github/workflows/ci.yml` runs formatting checks, GitHub Actions protocol
      guards, frontend checks, API checks, UI package tests, and contracts tests
      without deploying or pushing images.
  - Verification:
    - `pnpm format` formatted only changed Prettier-supported files.
    - `pnpm format:check` passed on the changed-file formatting baseline.
    - `pnpm check:github-actions:ci` passed.
    - `pnpm check:github-actions:deploy` passed.
    - `pnpm check:api:deploy-schema` passed after updating the workflow path
      to `.github/workflows/deploy.yml`.
    - Python/PyYAML parsed `.github/workflows/ci.yml` and
      `.github/workflows/deploy.yml`.
    - `node --check` passed for the modified GitHub Actions and formatting
      guard scripts.
    - `pnpm check` passed all 12 checks after installing local API
      dependencies in the current Python environment to match the CI install
      step. Docker CLI remains unavailable locally, so compose validation stayed
      on the existing static path and no deployment command was run.

- Latest task addendum (2026-06-19, P1.57 API image build and MySQL schema guard):
  - Goal: after the frontend packaging/deploy workflow succeeds, also build
    and publish the Python API image, while keeping MySQL application schema
    fields correct for new builds.
  - Status: merged to `main` through PR #4, then refined directly on `main`.
    The workflow is being optimized from one serial deploy job into
    change-detected `build-web`, `build-api`, and unified `deploy` jobs with
    optional Tencent Cloud TCR image push/pull. Older draft PRs #1, #2, and #3
    were closed as superseded. No production API cutover was run.
  - Important files touched:
    - `.github/workflows/deploy-frontend.yml`
    - `apps/api/src/database/mysql/schema_migration.py`
    - `scripts/check-api-deploy-schema.mjs`
    - `scripts/run-api-check.mjs`
    - `scripts/check-all.mjs`
    - `scripts/check-github-actions-deploy.mjs`
    - `apps/api/src/database/postgresql/postgresql_manager.py`
    - `package.json`
    - `deploy/backend/README.md`
    - `deploy/frontend/README.md`
    - `docs/current-state.md`
  - Workflow behavior:
    - `detect-changes` classifies each push as web, API, both, or no deploy.
    - `build-web` runs `pnpm check:web`, retains frontend artifacts, and
      pushes the frontend image only when web files changed.
    - `build-api` runs `pnpm check:api`, retains API deploy metadata, and
      pushes the API image only when API files changed.
    - Both image jobs always push GHCR tags. If all TCR variables/secrets are
      present, they also push TCR tags and the server deploy uses TCR images.
    - The deploy job waits for required image builds, then opens one SSH
      session and only pulls/switches changed targets. If API changed, it runs
      `python -m src.database.mysql.schema_migration --mode apply` from that
      image with the production secret env file mounted read-only.
    - The workflow does not start the API container, change Nginx, or restart
      `blog-api.service`; backend traffic remains on the existing production
      service until explicit cutover approval.
  - MySQL schema guard:
    - Declares the current minimal application schema for `users`, `roles`,
      `resources`, `user_roles`, `role_resources`, `tag`, `category`, `blog`,
      and `blog_tag`.
    - `--mode check` is static and runs in `pnpm check:api`.
    - Database modes are `plan`, `validate`, and `apply`.
    - `apply` only creates missing tables/columns and fails on incompatible
      existing column types instead of rewriting data.
  - Verification:
    - `node scripts/check-api-deploy-schema.mjs` first failed as expected on
      missing API image/schema workflow wiring.
    - `apps\api\.venv\Scripts\python.exe apps\api\src\database\mysql\schema_migration.py --mode check` passed.
    - `node scripts/check-api-deploy-schema.mjs` passed after implementation.
    - `node scripts/check-github-actions-deploy.mjs` passed.
    - `node --check scripts/check-api-deploy-schema.mjs` passed.
    - `node --check scripts/run-api-check.mjs` passed.
    - `pnpm check:api` passed and included
      `MySQL schema contract check passed: 9 tables, 43 columns.`
    - Python/PyYAML parsed `.github/workflows/deploy-frontend.yml` and found
      the API image and deploy/schema steps.
    - `git diff --check origin/main..HEAD` passed on clean PR branch.
    - `pnpm check:github-actions:deploy` passed on clean PR branch.
    - `pnpm check:api:deploy-schema` passed on clean PR branch.
    - GitGuardian passed on PR #4 after excluding historical `.env*` deletion
      diff lines and rewording a PostgreSQL docstring that looked like a
      generic password declaration.
    - After PR #4 merged, main workflow failures were fixed in follow-up
      commits:
      - `e8a49f8` made contract route file scanning independent of `rg`.
      - `c68d497` made legacy API file scanning independent of `rg`.
      - `d88d151` installed API Python dependencies in CI and lazy-loaded
        MySQL migration database dependencies for static checks.
      - `cf842a0` increased deploy timeout after first API image pull exceeded
        30 minutes.
    - Latest optimization work adds change detection, split web/API builds,
      optional TCR image push/pull, and server deploy that only touches changed
      targets. Local protocol checks passed before pushing this optimization:
      `pnpm check:github-actions:deploy`, `pnpm check:api:deploy-schema`, YAML
      workflow parsing, and `git diff --check`.
  - Next suggested step:
    - Push the split/TCR workflow optimization to `main`, then watch the next
      GitHub Actions run. Configure Tencent Cloud TCR variables/secrets before
      expecting the server to pull TCR image tags.

- Latest task addendum (2026-06-19, P1.56 GitHub Actions frontend deploy):
  - Goal: add a GitHub Actions workflow that deploys the frontend on every
    `main` change, cancels older overlapping runs, and retains build artifacts.
  - Status: implemented locally; not pushed or run on GitHub yet.
  - Important files touched:
    - `.github/workflows/deploy-frontend.yml`
    - `scripts/check-github-actions-deploy.mjs`
    - `scripts/check-all.mjs`
    - `package.json`
    - `deploy/frontend/README.md`
  - Workflow behavior:
    - `Deploy Frontend` runs on `main` push and `workflow_dispatch`.
    - Deployment job is gated to `refs/heads/main`.
    - `concurrency.cancel-in-progress: true` cancels older overlapping
      frontend deploy runs for the same ref.
    - The workflow runs `pnpm check:web`, uploads `apps/web/dist` and deploy
      metadata artifacts for 30 days, builds/pushes
      `ghcr.io/zhangnoname/sun-world-frontend` with both SHA and `latest`
      tags, then SSHes to the Lighthouse server to recreate `my-frontend`.
    - Backend/API deployment remains intentionally excluded until the
      `blog_end` to `apps/api` production cutover is approved.
  - Required GitHub Secrets:
    - `LIGHTHOUSE_HOST`
    - `LIGHTHOUSE_USER`
    - `LIGHTHOUSE_SSH_KEY`
    - optional `LIGHTHOUSE_PORT`
  - Verification:
    - `node scripts/check-github-actions-deploy.mjs` first failed as expected
      because workflow/docs/package wiring were missing.
    - `pnpm check:github-actions:deploy` passed after implementation.
    - `node --check scripts/check-github-actions-deploy.mjs` passed.
    - `node --check scripts/check-all.mjs` passed.
    - Python/PyYAML parsed `.github/workflows/deploy-frontend.yml` and
      confirmed the `on` trigger key.
    - `git diff --check` passed with existing Windows CRLF conversion warnings.
  - Next suggested step:
    - Add the required GitHub Secrets, push this branch/merge to `main`, then
      watch the first `Deploy Frontend` run under GitHub Actions.

- Latest task addendum (2026-06-19, P1.55 local dev launcher):
  - Goal: add root-level development launchers that can start the Python API
    and web client together, or either service alone, while supporting Windows,
    macOS, and VSCode integrated terminals.
  - Status: implemented locally; no deploy was run.
  - Important files touched:
    - `.vscode/tasks.json`
    - `dev.mjs`
    - `dev.ps1`
    - `dev.sh`
    - `scripts/start-api.mjs`
    - `scripts/check-dev-launcher.mjs`
    - `start.md`
    - `package.json`
  - Launcher behavior:
    - Windows: `.\dev.ps1` or `pnpm dev:local` opens separate PowerShell
      terminals for API and web.
    - macOS: `sh dev.sh` or `pnpm dev:local` opens separate Terminal.app
      windows for API and web.
    - Single-service aliases remain `py`/`api` for backend and `client`/`web`
      for frontend.
    - VSCode users should run `Tasks: Run Task` -> `Sun World: Dev All`,
      `Sun World: Dev API`, or `Sun World: Dev Web` so terminals stay inside
      the VSCode Terminal panel.
    - Root `pnpm dev:api` now uses cross-platform `scripts/start-api.mjs`
      instead of the Windows-only PowerShell API starter.
    - `start.md` documents VSCode task usage, Windows/macOS commands,
      single-service modes, and the launcher layering.
  - Verification:
    - `node scripts/check-dev-launcher.mjs` first failed as expected because
      root `dev.ps1` did not exist.
    - After adding VSCode/macOS support, `pnpm check:dev-launcher` first
      failed on the missing `dev.mjs`, `dev.sh`, `.vscode/tasks.json`, and
      `dev:local`, then passed after implementation.
    - `pnpm check:dev-launcher` passed after implementation.
    - PowerShell parser check for `dev.ps1` passed.
    - `node --check dev.mjs` and `node --check scripts/start-api.mjs` passed.
    - `node scripts/start-api.mjs --install-only --no-install` passed without
      starting the API server.
    - `node dev.mjs invalid-mode` returned the expected usage error.
    - `pnpm check:dev-launcher` first failed after the doc guard was added
      because `start.md` was missing, then passed after adding the document.
    - `git diff --check` passed with existing Windows CRLF conversion warnings
      on touched/dirty files.
  - Next suggested step:
    - Use the VSCode tasks when working inside VSCode; use `.\dev.ps1`,
      `sh dev.sh`, or `pnpm dev:local` when launching external terminals.

- Previous task addendum (2026-06-19, P1.29 platform chain, monitoring, build plan):
  - Goal: decide commit/push cadence, assess frontend-backend chain, add a
    minimum performance monitoring platform, document iteration plan, and start
    the first iteration within the 5-hour cap.
  - Status: first iteration implemented locally; no deploy was run.
  - Commit/push decision:
    - Do not commit/push after every tiny edit.
    - Commit after coherent verified checkpoints.
    - Push after checks pass or for backup/handoff only.
  - Important files touched:
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
    - `docs/architecture/observability-and-analytics.md`
    - `apps/api/src/core/rum_metrics.py`
    - `apps/api/src/type/telemetry_type.py`
    - `apps/api/src/routers/telemetry/*`
    - `apps/api/src/routers/admin/admin.py`
    - `apps/web/src/modules/admin/*`
    - `packages/contracts/openapi.json`
    - `packages/contracts/src/generated-api-types.ts`
    - `packages/contracts/src/routes.ts`
    - `scripts/check-rum-metrics.py`
    - `scripts/run-api-check.mjs`
    - `Dockerfile`
    - `docker-compose.yml`
  - New monitoring protocol:
    - Public ingestion: `POST /telemetry/events`
    - Admin read model: `GET /admin/telemetry`
    - RUM collector aggregates accepted/rejected events, Web Vitals, event
      severities, and bounded recent sanitized samples.
    - Admin metrics page now loads request metrics and RUM metrics together.
  - Build/runtime adjustment:
    - Frontend Docker build supports public `VITE_BASE_URL` and
      `VITE_TELEMETRY_ENDPOINT` build args.
    - Compose defaults telemetry endpoint to
      `https://api.sunworld.site/telemetry/events`.
  - Verification:
    - `python scripts\check-rum-metrics.py` first failed with missing module,
      then passed after implementation.
    - `apps\api\.venv\Scripts\python.exe scripts\export-openapi.py` passed.
    - `pnpm -F @sun-world/contracts exec openapi-typescript openapi.json -o src/generated-api-types.ts` passed.
    - `pnpm check:api` passed: API migration check and RUM protocol check.
    - `pnpm -F @sun-world/contracts test` passed.
    - `pnpm -C apps/web exec vue-tsc --noEmit` passed after fixing optional
      `events_by_name` handling.
    - `pnpm -C apps/web build` passed with existing Vite CJS and Element Plus
      Sass deprecation warnings.
    - `pnpm check:web:budgets` passed; admin metrics chunk gzip remained below
      budget.
    - `pnpm check:compose` passed local static validation because local Docker
      CLI is unavailable.
    - Remote read-only compose parse passed by piping current
      `docker-compose.yml` over stdin to Tencent Cloud Docker Compose; no file
      was written and no service was started.
  - Next suggested step:
    - Do not start backend production cutover yet.
    - Next safe iteration is Dockerfile cache layout optimization and RUM
      persistence adapter selection.

- Previous task addendum (2026-06-19, P1.30 Docker build cache guard):
  - Goal: continue the packaging/build optimization part of the active platform
    objective without deploying.
  - Status: implemented locally and verified.
  - Important files touched:
    - `Dockerfile`
    - `package.json`
    - `scripts/check-docker-build-context.mjs`
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
    - `docs/current-state.md`
  - Build optimization:
    - Frontend Dockerfile now copies root/workspace manifests before source
      code and runs `pnpm install --frozen-lockfile` before `COPY . .`.
    - This keeps dependency install cache reusable for source-only changes.
    - Added `pnpm check:dockerfile` and included it in `pnpm check:compose`.
  - Verification:
    - `pnpm check:dockerfile` passed.
    - `pnpm check:compose` passed local static validation.
    - Remote read-only compose parse via stdin on Tencent Cloud passed; no
      file was written and no service was started.
    - `pnpm check:api` passed.
    - `pnpm -F @sun-world/contracts test` passed.
    - `pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `pnpm -C apps/web build` passed with existing Vite CJS and Element Plus
      Sass deprecation warnings.
    - `pnpm check:web:budgets` passed.
  - Next suggested step:
    - Audit frontend API call sites for direct route strings and migrate the
      next batch to `@sun-world/contracts` route constants.

- Previous task addendum (2026-06-19, P1.31 contracts route usage and cross-platform checks):
  - Goal: continue the frontend/backend business-chain and build/run
    optimization work without deploying.
  - Status: implemented locally and verified.
  - Important files touched:
    - `apps/web/src/modules/blog/api.ts`
    - `apps/web/src/modules/account/api.ts`
    - `apps/web/src/modules/admin/api.ts`
    - `scripts/check-contract-route-usage.mjs`
    - `scripts/check-web.mjs`
    - `scripts/run-workspace-script.mjs`
    - `scripts/check-web.sh`
    - `package.json`
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
    - `docs/current-state.md`
  - Contract-chain change:
    - Added `pnpm check:contracts:usage`.
    - The check initially failed on direct string routes in blog/account/admin
      module API files, then passed after those files were migrated to
      `API_ROUTES` from `@sun-world/contracts`.
  - Build/run optimization:
    - `pnpm check:web` no longer requires `bash`; it now uses
      `scripts/check-web.mjs`.
    - `build:web`, `build:editor`, and `build:icons` no longer use POSIX-only
      `NODE_OPTIONS='...'` syntax; they run through
      `scripts/run-workspace-script.mjs`.
  - Verification:
    - `pnpm check:contracts:usage` first failed with listed direct route
      strings, then passed after migration.
    - `pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `pnpm -F @sun-world/contracts test` passed.
    - `pnpm check:api` passed.
    - `pnpm check:web` first failed because `bash` was missing, then passed
      after adding the Node-based checker.
    - `pnpm build:web` first failed because `NODE_OPTIONS` shell syntax was not
      portable, then passed after adding the Node workspace wrapper.
    - `pnpm build:icons` passed.
    - `pnpm build:editor` passed.
    - `pnpm build` passed end-to-end.
  - Next suggested step:
    - Review remaining non-module legacy request utilities (`apps/web/src/service/request.ts`
      and `apps/web/src/hooks/auth/auth.ts`) and decide whether to migrate,
      quarantine, or delete them.

- Previous task addendum (2026-06-19, P1.32 legacy API entrypoint cleanup):
  - Goal: continue frontend/backend chain cleanup by removing unused legacy
    API request entrypoints and guarding against regression.
  - Status: implemented locally and verified.
  - Important files touched:
    - Deleted `apps/web/src/service/request.ts`
    - Deleted `apps/web/src/hooks/auth/auth.ts`
    - `apps/web/src/modules/blog/types.ts`
    - `scripts/check-legacy-api-entrypoints.mjs`
    - `scripts/check-web.mjs`
    - `package.json`
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
    - `docs/current-state.md`
  - Evidence before deletion:
    - `rg` found no production imports of `service/request.ts` functions.
    - `rg` found no production imports of `hooks/auth/auth.ts`.
    - Remaining account auth flow used `service/auth.req.ts`, which delegated
      into `modules/account`; this was handled in P1.33.
  - Guardrail:
    - Added `pnpm check:web:legacy-api`.
    - The check initially failed on the two retired files and a historical
      `@/service/request` comment, then passed after deleting files and
      updating the comment.
    - `pnpm check:web` now includes the legacy API entrypoint check.
  - Verification:
    - `pnpm check:web:legacy-api` passed.
    - `pnpm check:web` passed.
    - `pnpm check:api` passed.
    - `pnpm check:compose` passed local static validation.
    - `pnpm check:contracts:usage` passed.
  - Next suggested step:
    - Continue checking older compatibility service files and retire them when
      they no longer own behavior.

- Previous task addendum (2026-06-19, P1.33 account service facade removal):
  - Goal: finish the account-domain frontend/backend chain cleanup by removing
    compatibility facades that only forwarded to `modules/account`.
  - Status: implemented locally and verified.
  - Important files touched:
    - Deleted `apps/web/src/service/auth.req.ts`
    - Deleted `apps/web/src/service/user.req.ts`
    - `apps/web/src/store/auth.ts`
    - `scripts/check-legacy-api-entrypoints.mjs`
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
    - `docs/current-state.md`
  - Contract-chain change:
    - `store/auth.ts` now imports `login`, `register`, and `getCurrentUser`
      directly from `@/modules/account`.
    - `scripts/check-legacy-api-entrypoints.mjs` now guards
      `service/auth.req.ts` and `service/user.req.ts` as retired paths.
  - Verification:
    - `pnpm check:web:legacy-api` first failed on the facades and store imports,
      then passed after migration and deletion.
    - `pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `pnpm check:contracts:usage` passed.
    - `pnpm check:api` passed.
    - `pnpm check:web` passed.
  - Next suggested step:
    - Audit remaining files under `apps/web/src/service` and classify them as
      active shared infrastructure, module facades, or retirement candidates.

- Latest task addendum (2026-06-19, P1.34 blog management request facade removal):
  - Goal: continue API-chain cleanup by removing the remaining business facade
    under `apps/web/src/service`.
  - Status: implemented locally and verified.
  - Important files touched:
    - Deleted `apps/web/src/service/manageRequest.ts`
    - `apps/web/src/modules/blog/ui/manage/SunTable.vue`
    - `apps/web/src/modules/blog/ui/manage/tableTypes.ts`
    - `apps/web/src/modules/blog/composables/useBlogManagement.ts`
    - `apps/web/src/pages/manage/blog/index.vue`
    - `scripts/check-legacy-api-entrypoints.mjs`
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
    - `docs/current-state.md`
  - Contract-chain change:
    - `SunTable` no longer imports `@/service/manageRequest` or accepts a raw
      `url` prop.
    - Blog management now injects `fetchBlogTablePage`, implemented through
      module API `fetchBlogPage`.
    - Legacy API guard now treats `service/manageRequest.ts` as retired.
  - Verification:
    - `pnpm check:web:legacy-api` first failed on `manageRequest.ts` and the
      `SunTable` import, then passed after migration and deletion.
    - `pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `pnpm check:contracts:usage` passed.
    - `pnpm check:web` passed.
    - `pnpm check:api` passed.
    - `pnpm check:compose` passed local static validation.
  - Next suggested step:
    - Keep `apps/web/src/service/http.ts` as shared HTTP infrastructure and
      continue moving business API ownership into modules.

- Latest task addendum (2026-06-19, P1.35 AI module API boundary and Python import trim):
  - Goal: continue frontend/backend chain cleanup by moving AI chat requests
    into the module API boundary and reducing browser/backend import bloat.
  - Status: implemented locally and verified; no deploy was run.
  - Important files touched:
    - `apps/web/src/modules/ai/api.ts`
    - `apps/web/src/modules/ai/types.ts`
    - `apps/web/src/modules/ai/pages/AigcPage.vue`
    - Deleted `apps/web/src/aigc/*`
    - `apps/api/src/routers/ai/ai.py`
    - `packages/contracts/src/routes.ts`
    - `packages/contracts/openapi.json`
    - `packages/contracts/src/generated-api-types.ts`
    - `scripts/check-legacy-api-entrypoints.mjs`
    - `scripts/check-contract-route-usage.mjs`
    - `package.json`
    - `pnpm-lock.yaml`
  - Contract-chain change:
    - AI routes are exposed as `API_ROUTES.ai.*`.
    - `AigcPage` now sends through `sendAiMessage()` from
      `apps/web/src/modules/ai/api.ts`.
    - The old browser-side LangChain/OpenAI client under `apps/web/src/aigc`
      is deleted and guarded against reintroduction.
    - `pnpm check:web:legacy-api` now rejects direct business imports of
      `@/service/http` outside the shared API infrastructure.
  - Python optimization:
    - Removed unused eager AI router imports.
    - `GemmaModel` and `QwenModel` are imported lazily inside the image
      endpoints that need them.
    - `/ai/chat` now declares `response_model=ApiResponse[str]`, then OpenAPI
      and generated TypeScript contracts were refreshed.
  - Bundle/package change:
    - Removed unused root JS `@langchain/*`, `langchain`, and `openai`
      dependencies after deleting the browser client.
    - Removed the stale `langchain` manual chunk rule from the web Vite config.
  - Verification:
    - Red check first failed as expected:
      - `pnpm -F @sun-world/contracts test` failed because `API_ROUTES.ai`
        was missing.
      - `pnpm check:web:legacy-api` failed on direct `@/service/http` import
        in `apps/web/src/aigc/ai.func.ts`.
    - `pnpm install --lockfile-only` passed.
    - `apps\api\.venv\Scripts\python.exe scripts\export-openapi.py` passed.
    - `pnpm -F @sun-world/contracts exec openapi-typescript openapi.json -o src/generated-api-types.ts` passed.
    - `pnpm -F @sun-world/contracts test` passed.
    - `pnpm check:web:legacy-api` passed after narrowing an `aigc` false
      positive for the admin menu page.
    - `pnpm check:contracts:usage` passed.
    - `pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `pnpm check:web` passed; AIGC page chunk is now 6.41 KiB gzip and no
      `langchain` chunk is emitted. Existing Vite CJS, Element Plus Sass, and
      empty `vendor-dayjs` warnings remain.
    - `pnpm check:api` passed: 87 Python files compiled; repository boundary
      clean; RUM metrics protocol passed.
    - `pnpm check:compose` passed local static validation; Docker CLI is still
      unavailable locally and no deployment command was run.
  - Next suggested step:
    - Audit remaining large frontend lazy chunks (`vendor`, `echarts`,
      `vditor`) and decide whether route-level or package-level lazy loading
      can shrink the initial path further.

- Latest task addendum (2026-06-19, P1.36 route-only vendor chunk split):
  - Goal: continue build/run/module packaging optimization by separating
    optional heavy page dependencies from the global vendor chunk.
  - Status: implemented locally and verified; no deploy was run.
  - Important files touched:
    - `apps/web/vite.config.ts`
    - `apps/web/src/util/function.ts`
    - `apps/web/src/modules/video/pages/VideoPage.vue`
    - `apps/web/src/modules/video/ui/VideoPlayer.vue`
    - `apps/web/performance-budgets.json`
    - `scripts/check-web-chunks.mjs`
    - `scripts/check-web.mjs`
    - `package.json`
  - Packaging change:
    - Artplayer/HLS dependencies now build into a named `video-player` chunk.
    - JSZip now builds into a named `tile-export` chunk.
    - `saveTilesAsZip()` dynamically imports JSZip only when export runs.
    - Removed unused video module imports that were not part of runtime logic.
  - Guardrail:
    - Added `pnpm check:web:chunks`.
    - Root `pnpm check:web` now runs the chunk boundary check after build and
      performance budgets.
    - The new check first failed on the existing dist because `video-player`
      and `tile-export` chunks were missing and JSZip was statically imported.
      It passed after the split and dynamic import.
  - Budget update:
    - Added pattern budgets for:
      - `global-vendor-chunk-gzip` <= 140 KiB
      - `video-player-chunk-gzip` <= 230 KiB
      - `tile-export-chunk-gzip` <= 35 KiB
    - Current verified gzip sizes:
      - global vendor: 101.5 KiB
      - video-player: 208.3 KiB
      - tile-export: 27.7 KiB
  - Verification:
    - `node scripts/check-web-chunks.mjs` failed before the implementation and
      passed after rebuilding.
    - `pnpm check:web` passed, including contracts, legacy API guard, Vue
      typecheck, Vite build, performance budgets, and chunk boundary check.
    - `pnpm check:api` passed: 87 Python files compiled; repository boundary
      clean; RUM metrics protocol passed.
    - `pnpm check:compose` passed local static validation; Docker CLI is still
      unavailable locally and no deployment command was run.
  - Next suggested step:
    - Continue shrinking route-specific payloads by auditing whether
      `echarts`/`zrender` can be loaded only by admin charts and whether
      Vditor preview/editor imports can be split by read vs edit workflows.

- Latest task addendum (2026-06-19, P1.37 Vditor read/write chunk split):
  - Goal: continue module packaging optimization by separating article reading
    preview code from the full article editor runtime.
  - Status: implemented locally and verified; no deploy was run.
  - Important files touched:
    - `apps/web/vite.config.ts`
    - `apps/web/src/modules/blog/index.ts`
    - `apps/web/src/modules/blog/ui/CatalogCard.vue`
    - `apps/web/performance-budgets.json`
    - `scripts/check-web-chunks.mjs`
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Packaging change:
    - `vditor/dist/method.min` now builds into `vditor-preview`.
    - Full `vditor` editor runtime now builds into `vditor-editor`.
    - `CatalogCard.vue` no longer imports the full Vditor runtime.
    - Blog module preload now warms only `BlogDetailPage`; it no longer
      preloads `ArticleEditorPage` while users read public articles.
  - Guardrail:
    - `pnpm check:web:chunks` now requires `vditor-preview` and
      `vditor-editor`, rejects runtime Vditor imports from `CatalogCard.vue`,
      and rejects the old blog preload shape that pulled both read and write
      pages together.
    - The guard first failed on the old dist/source state, then passed after
      the split and rebuild.
  - Budget update:
    - Added pattern budgets:
      - `vditor-preview-chunk-gzip` <= 25 KiB
      - `vditor-editor-chunk-gzip` <= 80 KiB
    - Current verified gzip sizes:
      - `vditor-preview`: 13.0 KiB
      - `vditor-editor`: 67.4 KiB
  - Verification:
    - `pnpm check:web` passed, including contracts, legacy API guard, Vue
      typecheck, Vite build, performance budgets, and chunk boundary check.
    - `pnpm check:api` passed: 87 Python files compiled; repository boundary
      clean; RUM metrics protocol passed.
    - `pnpm check:compose` passed local static validation; Docker CLI is still
      unavailable locally and no deployment command was run.
  - Next suggested step:
    - Audit admin charts next: determine whether `echarts` and `zrender`
      should be loaded only on `/manage` chart/metrics workflows or whether
      existing admin module preload already makes that acceptable.

- Latest task addendum (2026-06-19, P1.38 admin charts async chunk split):
  - Goal: continue module packaging optimization by keeping ECharts/ZRender
    behind the admin chart tab instead of the manage shell.
  - Status: implemented locally and verified; no deploy was run.
  - Important files touched:
    - `apps/web/src/pages/manage/index.vue`
    - `apps/web/src/modules/admin/index.ts`
    - `apps/web/src/modules/admin/ui/chartConfig.ts`
    - `apps/web/vite.config.ts`
    - `apps/web/performance-budgets.json`
    - `scripts/check-web-chunks.mjs`
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Packaging change:
    - `AdminChartsPage` is now loaded with `defineAsyncComponent()` when the
      chart tab is selected.
    - The admin module no longer declares a broad `preload` hook, avoiding
      cross-warming manage and metrics routes.
    - Local admin chart shell/UI/config code is named `admin-charts`.
    - `chartConfig.ts` now imports ECharts option types with `import type`.
  - Guardrail:
    - `pnpm check:web:chunks` now requires `admin-charts`, rejects static
      `AdminChartsPage` imports from `pages/manage/index.vue`, rejects broad
      admin module preload, and rejects runtime ECharts imports from
      `chartConfig.ts`.
    - The guard failed before implementation on all four conditions and passed
      after rebuilding.
  - Budget update:
    - Added `admin-charts-chunk-gzip` <= 12 KiB.
    - Current verified gzip size: `admin-charts` 0.8 KiB.
    - ECharts and ZRender remain separate heavy dependency chunks loaded by the
      async chart path.
  - Verification:
    - `pnpm check:web` passed, including contracts, legacy API guard, Vue
      typecheck, Vite build, performance budgets, and chunk boundary check.
    - `pnpm check:api` passed: 87 Python files compiled; repository boundary
      clean; RUM metrics protocol passed.
    - `pnpm check:compose` passed local static validation; Docker CLI is still
      unavailable locally and no deployment command was run.
  - Next suggested step:
    - Review the remaining `index` chunk sources and remove the broad
      `src/pages/**` manual chunk merge if it is still pulling unrelated
      legacy pages together.

- Latest task addendum (2026-06-19, P1.39 legacy page chunk split):
  - Goal: remove the broad legacy `src/pages/** -> index` manual chunk merge
    and keep remaining page shells as explicit route-owned chunks.
  - Status: implemented locally and verified; no commit, push, or deploy was
    run.
  - Important files touched:
    - `apps/web/vite.config.ts`
    - `apps/web/src/modules/account/index.ts`
    - `apps/web/performance-budgets.json`
    - `scripts/check-web-chunks.mjs`
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Packaging change:
    - Removed the broad `src/pages/**` manual chunk rule that folded legacy
      pages into `index`.
    - Added explicit manual chunks for `page-game-tiles`, `page-tools`,
      `page-keep`, `page-login`, `page-register`, `page-me`,
      `page-qq-callback`, and `manage-shell`.
    - Removed account module broad preload of login/register/profile/callback
      routes.
  - Guardrail:
    - `pnpm check:web:chunks` now requires the explicit page chunks and rejects
      the old account-wide preload and broad legacy page merge patterns.
    - The guard failed before implementation on missing chunks/preload/merge
      conditions and passed after rebuilding.
  - Budget update:
    - Added gzip budgets for the explicit page chunks:
      `manage-shell` <= 15 KiB, `page-me` <= 15 KiB, `page-login` <= 6 KiB,
      `page-register` <= 4 KiB, `page-game-tiles` <= 5 KiB,
      `page-keep` <= 3 KiB, `page-tools` <= 2 KiB, and
      `page-qq-callback` <= 2 KiB.
    - Current verified gzip sizes: `manage-shell` 11.2 KiB, `page-me` 12.0
      KiB, `page-login` 3.8 KiB, `page-register` 1.4 KiB,
      `page-game-tiles` 3.0 KiB, `page-keep` 1.3 KiB, `page-tools` 0.4 KiB,
      and `page-qq-callback` 0.4 KiB.
  - Verification:
    - `pnpm -C apps/web build` passed.
    - `pnpm check:web:chunks` passed.
    - `pnpm check:web:budgets` passed.
    - `pnpm check:web` passed, including contracts, legacy API guard, Vue
      typecheck, Vite build, performance budgets, and chunk boundary check.
    - `pnpm check:api` passed: 87 Python files compiled; repository boundary
      clean; RUM metrics protocol passed.
    - `pnpm check:compose` passed local static validation; Docker CLI is still
      unavailable locally and no deployment command was run.
    - `git diff --check` passed with Windows CRLF conversion warnings only.
  - Next suggested step:
    - Decide whether to commit the current coherent checkpoint locally, then
      continue auditing the remaining large optional chunks (`echarts`,
      `video-player`, and `element`) by route ownership.

- Latest task addendum (2026-06-19, P1.27 UI component contract package):
  - Goal: create a package-owned UI component protocol layer with normal,
    disabled, and labeled forms, theme-color switching, and mobile-specific
    interactions.
  - Status: `@sun-world/ui` foundation implemented locally on
    `monorepo-api-import`.
  - Important files touched:
    - `docs/architecture/frontend-ui-component-prd.md`
    - `docs/superpowers/plans/2026-06-19-ui-component-contracts.md`
    - `packages/ui/**`
    - `apps/web/package.json`
    - `apps/web/tsconfig.json`
    - `apps/web/vite.config.ts`
    - `package.json`
    - `pnpm-lock.yaml`
    - `docs/architecture/frontend-shared-ui-classification.md`
  - Components/API added:
    - `SunButton`, `SunInput`, `SunDatePicker`, `SunList`,
      `SunPagination`, `SunThemeProvider`
    - contracts exported from `@sun-world/ui`
    - `createSunThemeVars()` for theme color CSS-variable mapping
  - Mobile-specific decisions:
    - `SunDatePicker` mobile mode renders a trigger and bottom drawer, not an
      input that can open the software keyboard.
    - `SunList` mobile mode renders cards.
    - `SunPagination` mobile mode supports load-more and scroll-end
      `loadMore` emission through `autoLoadOnReachEnd`.
  - Verification:
    - `pnpm -C packages/ui test` passed: 7 files, 22 tests.
    - `pnpm -C packages/ui build` passed and generated ignored `dist`.
    - `pnpm test:ui` passed.
    - `pnpm build:ui` passed after making the new script Windows-compatible.
    - `pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `pnpm -C apps/web build` passed with existing Vite CJS and Element Plus
      Sass deprecation warnings only.
  - Next suggested step:
    - Migrate old `ZBtn` and simple form/list call sites to `@sun-world/ui`
      in a separate compatibility pass, keeping contract tests as the
      behavior guard.

- Goal: complete frontend modular platform long-term architecture with safe boundary hardening.
- Current status: P1.26 completed on `monorepo-api-import`; home route shell and `WeatherCard` ownership are now module-owned under `apps/web/src/modules/home`.
- Current architecture decision:
  - New module extraction strategy is documented in
    `docs/architecture/frontend-module-extraction-strategy.md`.
  - Modules should form vertical slices with `index.ts`, `api.ts`, `types.ts`,
    `errors.ts`, `composables/`, `pages/`, `ui/`, and optional `adapters/`
    before being considered package candidates.
  - Main Codex owns architecture/integration/verification; `coding` owns
    bounded implementation; `判官` owns review; `阎王` is reserved for high-level
    tradeoff work; `牛头` owns Claude Code / `claude-ds` packets only when
    server-side work is useful.
  - Agent lifecycle rule: maintain only four logical roles (`coding`, `阎王`,
    `判官`, `牛头`), reuse existing role agents instead of spawning per
    iteration, close completed runtime agents after integration, and reserve
    `阎王` / `gpt-5.5` for architecture tradeoffs only.
  - Agent naming rule: ignore random runtime nicknames in coordination; all
    prompts, handoff notes, reviews, and user-facing summaries must use the
    stable role names (`coding`, `阎王`, `判官`, `牛头`). Start each delegated
    prompt with `你的角色名是 <role>`.
  - Subagent cleanup status: no project-owned `.agents` registry is used;
    runtime ids are disposable and should not be preserved in durable docs.
    If the UI shows extra stale subagents, close them after confirming their
    final output has already been integrated; do not spawn replacements solely
    to rename them.
  - Context naming decision: keep `docs/` as the durable project documentation
    root. If agent task context is moved later, introduce lowercase `.task/`
    for task state, plans, protocol relay, and handoff context; do not rename
    `docs/` wholesale.
- Verification for this step:
  - `rg "@/pages/home|pages/home|@/components/WeatherCard|components/WeatherCard" apps/web/src -n`
    - Passed; no legacy home page or `WeatherCard` production references remain.
  - `rg "homeModule|HomePage|WeatherCard" apps/web/src docs/architecture docs/agent-handoff.md -n`
    - Passed; matches are new module-owned paths and historical docs.
  - `apps/web/src/app/router/create-router.ts`
    - Checked and fixed route merge order so module routes are registered before the core catch-all route.
  - `pnpm -C apps/web exec vue-tsc --noEmit`
    - Passed.
  - `pnpm -C apps/web build`
    - Passed (existing Vite CJS and Sass deprecation warnings only).
  - `git diff --check`
    - Passed (`LF will be replaced by CRLF` warnings only on touched files).
- Scope completed in this stage:
  - P1.26 completed: moved home route shell and `WeatherCard` into `apps/web/src/modules/home`:
    - `apps/web/src/pages/home/index.vue` -> `apps/web/src/modules/home/pages/HomePage.vue`
    - `apps/web/src/components/WeatherCard/index.vue` -> `apps/web/src/modules/home/ui/WeatherCard.vue`
    - `apps/web/src/modules/home/index.ts` created with `/` and `/home` routes and preload
    - `apps/web/src/app/router/routes.ts` no longer imports legacy `Home` or declares `/` and `/home`
    - `apps/web/src/app/router/create-router.ts` now keeps core catch-all routes after module routes
    - `apps/web/src/modules/registry.ts` now registers `homeModule`
    - `apps/web/src/components.d.ts` no longer declares global `WeatherCard`
    - `apps/web/src/pages/home` and `apps/web/src/components/WeatherCard` directories removed
  - P1.25 completed: moved AIGC page, local UI, and `ChannelCard` into `apps/web/src/modules/ai`:
    - `apps/web/src/pages/aigc/index.vue` -> `apps/web/src/modules/ai/pages/AigcPage.vue`
    - `apps/web/src/pages/aigc/side.vue` -> `apps/web/src/modules/ai/ui/ChatList.vue`
    - `apps/web/src/pages/aigc/config/chatInput.vue` -> `apps/web/src/modules/ai/ui/ChatInput.vue`
    - `apps/web/src/pages/aigc/config/configModal.vue` -> `apps/web/src/modules/ai/ui/ConfigModal.vue`
    - `apps/web/src/pages/aigc/config/modelName.vue` -> `apps/web/src/modules/ai/ui/ModelName.vue`
    - `apps/web/src/components/ChannelCard/index.vue` -> `apps/web/src/modules/ai/ui/ChannelCard.vue`
    - `apps/web/src/modules/ai/index.ts` now lazy-loads `./pages/AigcPage.vue`
    - `apps/web/src/components.d.ts` no longer declares global `ChannelCard`
    - `apps/web/src/pages/aigc` and `apps/web/src/components/ChannelCard` directories removed
  - P1.24 completed: moved video page and player into `apps/web/src/modules/video`:
    - `apps/web/src/pages/video/video.page.vue` -> `apps/web/src/modules/video/pages/VideoPage.vue`
    - `apps/web/src/components/Video/video.com.vue` -> `apps/web/src/modules/video/ui/VideoPlayer.vue`
    - `apps/web/src/pages/video` and `apps/web/src/components/Video` directories removed
    - `apps/web/src/app/router/routes.ts` no longer imports or routes legacy `VideoPage` directly
    - `apps/web/src/modules/registry.ts` now registers `videoModule`
    - `apps/web/src/modules/video/index.ts` created with `/video` route and preload
  - `App.vue` no longer provides blog base data (`tagList` / `categoryList` / `stats`) at app root.
  - New module composable `apps/web/src/modules/blog/composables/useBlogBaseData.ts` is introduced as the blog base data boundary.
  - Blog consumers now load base data on demand via `useBlogBaseData`:
    - `apps/web/src/pages/home/index.vue`
    - `apps/web/src/modules/blog/pages/ArticleEditorPage.vue`
    - `apps/web/src/pages/manage/blog/index.vue`
    - `apps/web/src/modules/blog/ui/SelfInfoCard.vue`
  - Removed `apps/web/src/util/request.ts` and `apps/web/src/util/data.ts` after migrating usage to module ownership.
  - P1.23 closure: moved `apps/web/src/pages/manage/charts/index.vue` to
    `apps/web/src/modules/admin/pages/AdminChartsPage.vue` and updated
    `apps/web/src/pages/manage/index.vue` to import it as `AdminChartsPage`.
- Review findings addressed:
  - Home page base-data fetch no longer blocks `blogList.loadFirstPage()` on failure (error is handled and ignored for list flow).
  - Fire-and-forget `loadBlogBaseData()` calls now have explicit `.catch(...)` handling in the four consumers.
  - P1.2 completed: `SelfInfoCard` ownership is closed by moving component into blog module UI:
    - moved from shared `components` to `apps/web/src/modules/blog/ui/SelfInfoCard.vue`
    - both usage sites now import explicitly (`apps/web/src/pages/home/index.vue`, `apps/web/src/modules/blog/pages/BlogDetailPage.vue`)
  - P1.3 completed: Blog UI ownership is closed:
    - `apps/web/src/components/BlogCard/index.vue` -> `apps/web/src/modules/blog/ui/BlogCard.vue`
    - `apps/web/src/components/CatalogCard/index.vue` -> `apps/web/src/modules/blog/ui/CatalogCard.vue`
    - `apps/web/src/components/CatalogCard/CatalogItem/index.vue` -> `apps/web/src/modules/blog/ui/CatalogItem.vue`
    - removed production-orphaned `apps/web/src/components/CatalogCard/index.data.ts`
    - usage points now import explicitly, and legacy `apps/web/src/components.d.ts` global declarations were cleaned:
      - `BlogCard`
      - `CatalogCard`
      - `CatalogItem`
  - P1.4 completed: homepage feed/list UI is extracted to module feed UI:
    - `apps/web/src/modules/blog/ui/BlogHomeFeed.vue` now owns homepage right-side blog feed logic, template, and scoped styles (base data + list logic, list mode/waterfall mode, summary/tag strip, load-more states).
    - `apps/web/src/pages/home/index.vue` now keeps only page-level shell concerns:
      - SEO / JSON-LD (`usePageMeta`, `useJsonLd`, `canonicalUrl`, `buildWebsiteJsonLd`)
      - left sidebar (`SelfInfoCard`, `WeatherCard`), sticky/sentinel scroll observer logic
      - page grid/layout wrapper (`.home-page` / `.left` / `.sidebar-sentinel`) and `<BlogHomeFeed />` composition
  - `apps/web/src/pages/manage/blog/index.vue` no longer mutates global `BlogTableColumns[2/3].formatter`; it now uses local computed `blogTableColumns`.
    - category formatter resolves via current `categoryList`.
    - tag formatter resolves via current `tagList`, with number/string id compatibility and guard for non-array tag values.
  - P1.7 completed: blog management-specific configuration/logic moved to module composable:
    - added `apps/web/src/modules/blog/composables/useBlogManagement.ts` to own management page concerns:
      - `blogSearchFormData` and internal `BlogTableColumns`
      - `useBlogBaseData` loading for `categoryList` / `tagList`
      - formatter-augmented `blogTableColumns`
      - `form`, `rules`, `formRef`, `onSubmit`, `onReset`
      - `initializeBlogManagement()` with existing error log path
    - `apps/web/src/pages/manage/blog/index.vue` now acts as page shell:
      - keeps template/style structure with `SunForm` + `SunTable`
      - `onMounted` calls `initializeBlogManagement()`
      - binds composable outputs only
    - removed `apps/web/src/pages/manage/blog/data.ts` after migrating references.
    - review outcome: no blocking findings; review follow-ups applied:
      - `rules` aligned to `title`
      - `formRef` adapted to component expose path (`formRef?.formRef?.validate/resetFields`)
      - `blogTableColumns` typed as `ComputedRef<SunTableColumn[]>`
  - P1.5 completed: reader logic extraction into `apps/web/src/modules/blog/composables/useBlogReader.ts`:
    - moved blog detail loading, Vditor preview render, catalog extraction, and derived states for:
      - `blogPreview`
      - `catalog`
      - `loading`
      - `blogInfo`
      - `publishedAt`
      - `commentCount`
      - `wordCount`
      - `articleDescription`
      - `articleCanonical`
    - `BlogDetailPage` keeps page responsibilities (route id handling, SEO/JSON-LD registration, error prompts, layout/template rendering).
    - review outcome: no blocking findings; `wordCount` is now typed as `ComputedRef<number>`.
  - P1.6 completed: authoring logic extraction into `apps/web/src/modules/blog/composables/useBlogAuthoring.ts`:
    - moved blog editor flow into module composable, including:
      - base data loading for authoring page
      - editor instance creation and initialization
      - `window.blogEditor` debug attach
      - word count tracking
      - title/category/tag state
      - save dedupe guard
      - title-empty validation
      - tag normalization and `CreateBlogPayload` composition
      - `createBlog` invoke + success/error feedback
    - `ArticleEditorPage.vue` now behaves as page shell:
      - keeps props/template/styles
      - `onMounted` calls `initializeAuthoring()`
      - binds actions/state only from composable
    - review outcome: no blocking findings; typing follow-up applied:
      - `blogCategory: string | number`
      - `blogTag: Array<string | number>`
      - `useBlogAuthoring(): BlogAuthoringViewModel`
  - P1.8 completed: build dependency blockers removed for extraction validation:
    - `pnpm install --frozen-lockfile` restored missing `web-vitals@5.3.0` and recovered dependency state.
    - `@vue/shared: 3.5.22` was added explicitly in `apps/web/package.json` and synced in `pnpm-lock.yaml` for Element Plus internal import compatibility.
    - `pnpm install --force --frozen-lockfile` rebuilt workspace link layout.
    - `pnpm -C apps/web build` now passes.
    - `useBlogAuthoring` switched to `shallowRef<BlogEditorClass>` for editor instance ownership.
    - `useBlogManagement` now calls exposed `validate` / `resetFields` through function-level optional chaining.
  - P1.9 completed: narrowed remaining page-level vue-tsc noise while keeping behavior unchanged:
    - `apps/web/src/pages/manage/charts/index.vue`
      - chart cards are rendered with `v-for` using existing `chart.options`.
      - chart options are constrained with `import type { EChartsOption } from 'echarts'` to avoid runtime type imports.
    - `apps/web/src/pages/video/video.page.vue`
      - added local type `ArtplayerWithHls = Artplayer & { hls?: Hls }` so `art.hls` runtime extension is safely typed.
      - HLS init/destroy flow behavior is unchanged.
    - review outcome: no blocking findings; chart page keeps 4 cards, video page cast is localized and behavior-safe.
  - P1.10 completed: reduced global type-check noise on app-wide runtime surfaces:
    - `apps/web/src/env.d.ts` added minimal `QC` global declaration for current call shape:
      - `QC.Login.showPopup({ appId, redirectURI })`.
    - `apps/web/src/env.d.ts` added `declare module '@vue/runtime-core'` augmentation with:
      - `ComponentCustomProperties.$t: import('vue-i18n').ComposerTranslation`.
    - kept Vite env and virtual svg declarations unchanged; no top-level imports were introduced.
  - P1.11 completed: temporary editor boundary isolation for web typecheck.
    - `apps/web/src/modules/blog/composables/useBlogList.ts`
      - fixed `resolvedTags`/`resolvedCategories` inferred types by annotating source resolution to `TagResponse[]` / `CategoryResponse[]`, removing `{}`-inferred `.name` error risk.
    - `apps/web/tsconfig.json`
      - switched `@sun-world/editor` path from `../../packages/editor/src/` to local shim type file `./src/types/sun-world-editor.d.ts`.
    - `apps/web/src/types/sun-world-editor.d.ts` (new)
      - added minimal module declarations for `@sun-world/editor` to keep web compile-time API expectations in scope.
    - Judge review status: no blocking findings; `getActiveToolName` return type was tightened to `ToolName | null` during follow-up.
    - result: web no longer typechecks directly into `packages/editor/src`.
  - P1.12 completed: fixed web Vue type baseline by converting `apps/web/src/env.d.ts` into a proper external module declaration file.
    - Changed `apps/web/src/env.d.ts` to use:
      - `import type { ComposerTranslation } from 'vue-i18n'`
      - `export {}`
    - Moved `ImportMetaEnv`, `ImportMeta`, and `QC` declarations under `declare global`.
    - Kept `@vue/runtime-core` augmentation focused on `ComponentCustomProperties.$t`.
    - Kept `virtual:svg-icons-register` and `virtual:svg-icons-names` module declarations.
  - P1.13 completed: improved `packages/icons` package build/type boundary.
    - Fixed `packages/icons/tsconfig.json` include set to match source layout under `src` and include Vue files for declaration generation.
    - Added package `exports` map in `packages/icons/package.json` with `.` entry exposing `types/import/require/default` and marked package `sideEffects: false` for tree-shaking friendliness.
    - `pnpm -C packages/icons build` now emits `packages/icons/dist/types/index.d.ts`.
    - Web remains temporarily aliased to `packages/icons/src` in web config; no web resolver switch in this round.
    - DTS generation is now scoped to `src/index.ts` + `src/icons/**`; demo app files such as `src/App.vue` are no longer in declaration emit scope.
  - P1.14 completed: editor public API contract moved into `packages/editor` package-owned shim.
    - Added `packages/editor/src/public-api.d.ts` with `@sun-world/editor` exports used by web (`ElementType` / `ToolName` / `NodeInfo` / `BaseElement` / `SWEditor` / `IEditorOptions`).
    - Updated `packages/editor/package.json` to point `types` and `exports['.'].types` at `./src/public-api.d.ts`.
    - Updated `apps/web/tsconfig.json` `@sun-world/editor` alias to `../../packages/editor/src/public-api.d.ts`.
    - Removed app-local shim `apps/web/src/types/sun-world-editor.d.ts`; web now consumes package-owned contract.
  - P1.15 completed: first batch of editor internal dts/type cleanup in package boundary:
    - `packages/editor/tsconfig.app.json` excludes keybinding demo/example files from dts diagnostics scope.
    - `BaseElement` internals adjusted for AABB flow (`_updateAABBCache` call signature and `hitTest` use of available AABB access).
    - `InputBindingManager` now keeps `bindings`/`handlers` separated and enforces same-id replace-on-write for registrations, so action bindings added later (e.g., save/delete/copy/wheel-zoom) are not swallowed by default non-action bindings.
    - `BaseTool` now provides default no-op hooks and unified key hook modifier signatures for optional events.
    - `InputManager` now follows public tool access via `getToolManager().getActiveTool()` instead of private/editor-internal member reads.
    - `Transformer.setTransform` now uses explicit parameter typing.
  - P1.16 completed: editor app-integration route boundary is closed:
    - legacy `apps/web/src/pages/canvas/**` files were moved into
      `apps/web/src/modules/editor`.
    - `/canvas` still keeps the same route path/meta/nav/preload behavior, but
      `apps/web/src/modules/editor/index.ts` now lazy-loads
      `./pages/EditorCanvasPage.vue`.
    - route shell lives at
      `apps/web/src/modules/editor/pages/EditorCanvasPage.vue`.
    - editor route-owned panels/tree/icon UI live under
      `apps/web/src/modules/editor/ui/`.
  - P1.17 completed: editor public type boundary now points to package-owned source entry + canonical d.ts:
    - removed hand-written `packages/editor/src/public-api.d.ts`.
    - added `packages/editor/src/public-api.ts` and re-exported it from `packages/editor/src/index.ts`.
    - `packages/editor/package.json` `types`/`exports['.'].types` now target `./dist/index.d.ts`.
    - `apps/web/tsconfig.json` maps `@sun-world/editor` to `../../packages/editor/src/index.ts` and adds editor `@/*` fallback alias for clean source-level type checks.
- P1.18 completed: editor source alias boundary cleanup for `apps/web`.
  - Rewrote all `packages/editor/src` imports that used `@/...` alias to package-relative imports.
  - Removed the editor fallback from `apps/web/tsconfig.json`:
    - changed `"@/*": ["./src/*", "../../packages/editor/src/*"]`
    - to `"@/*": ["./src/*"]`
  - Kept `"@sun-world/editor": ["../../packages/editor/src/index.ts"]` unchanged so editor imports remain explicit.
  - Verified `packages/editor` can build and web typecheck/build can run without the temporary editor-source fallback.
- P1.19 completed: shared UI classification phase added to prevent junk drawer drift.
  - Added `docs/architecture/frontend-shared-ui-classification.md` with source-of-truth ownership mapping for
    `apps/web/src/components` across app-shell primitives, shared UI candidates, feature-owned components, package candidates, and orphan/demo artifacts.
  - Updated `docs/architecture/frontend-module-extraction-strategy.md` P1.19 status to reference the new baseline.
- P1.20 completed: orphan/demo and demo fixture cleanup in `apps/web/src/components`.
  - Deleted orphan/dead assets: `DIalogCard/index.vue`, `CutomBtn.vue`,
    `LoadMore/loadMopre.vue`, `Waterfall/useWaterfall.ts`, `Waterfall/test.ts`,
    `Form/testData.ts` after decoupling `Waterfall` from demo payload import.
  - Removed deleted legacy global declarations from `apps/web/src/components.d.ts`
    (`CutomBtn`, `DIalogCard`).
  - `apps/web/src/components/Waterfall/waterfall.vue` now defines `WaterfallItem` locally.
- Verification:
  - `pnpm -C packages/editor build`
    - Passed; generated `packages/editor/dist/index.d.ts`.
  - `pnpm -C apps/web exec vue-tsc --noEmit`
    - Passed.
  - `pnpm -C apps/web build`
    - Passed (existing third-party Sass/Vite deprecation warnings remain).
  - `git diff --check`
    - `LF to CRLF` warning only on touched files.
  - `rg "@/" packages/editor/src -n`
    - no matches (excluding comments left in untouched files).
  - `pnpm -C packages/editor build`
    - Passed.
  - `pnpm -C apps/web exec vue-tsc --noEmit`
    - Passed.
  - `pnpm -C apps/web build`
    - Passed (existing deprecation warnings only).
  - `rg "public-api\\.d\\.ts|@sun-world/editor" packages/editor apps/web docs/agent-handoff.md -n`
    - `public-api.d.ts` removed from active package contract; web editor mapping now uses `src/index.ts`.
    - P1.20 doc/asset cleanup verification passed by removing dangling component references.
  - Review: no blocking findings; P1.18 alias cleanup unblocks app-level editor source fallback removal.
  - P1.19 review: no blocking findings; doc nits for status, verification
    indentation, and Waterfall demo/test risk were addressed.
  - P1.20 verification:
    - `rg "DIalogCard|CutomBtn|LoadMore|loadMopre|Waterfall/test|useWaterfall|Form/testData|TestList" apps/web/src -n`
      - no active import/usage references remain; only historical comments already cleaned in touched files.
    - `pnpm -C apps/web exec vue-tsc --noEmit`
      - Passed.
    - `pnpm -C apps/web build`
      - Passed (existing Vite CJS and Element Plus Sass deprecation warnings only).
- P1.21 completed: blog management feature-owned UI moved into `apps/web/src/modules/blog/ui/manage`.
  - Migrated component/type files:
    - `apps/web/src/components/Form/index.vue` -> `apps/web/src/modules/blog/ui/manage/SunForm.vue`
    - `apps/web/src/components/Form/type.ts` -> `apps/web/src/modules/blog/ui/manage/formTypes.ts`
    - `apps/web/src/components/Table/index.vue` -> `apps/web/src/modules/blog/ui/manage/SunTable.vue`
    - `apps/web/src/components/Table/type.ts` -> `apps/web/src/modules/blog/ui/manage/tableTypes.ts`
  - Updated usages:
    - `apps/web/src/pages/manage/blog/index.vue`
    - `apps/web/src/modules/blog/composables/useBlogManagement.ts`
  - Removed old directories:
    - `apps/web/src/components/Form`
    - `apps/web/src/components/Table`
  - `docs/architecture/frontend-shared-ui-classification.md` and
    `docs/architecture/frontend-module-extraction-strategy.md` updated for P1.21 closure.
  - Verification:
    - `rg "@/components/(Form|Table)|components/Form|components/Table|SunForm|SunTable|FormItem|SunTableColumn" apps/web/src -n`
      - Passed; old `@/components/Form` / `@/components/Table` references are gone, and remaining `SunForm` / `SunTable` matches point at module-owned paths.
    - `pnpm -C apps/web exec vue-tsc --noEmit`
      - Passed.
    - `pnpm -C apps/web build`
      - Passed (existing Vite CJS and Element Plus Sass deprecation warnings only).
    - `git diff --check`
      - Passed (`LF will be replaced by CRLF` warnings only on touched files).
- P1.22 completed: admin/charts feature-owned UI moved into admin module private UI.
  - Migrated component/type files:
    - `apps/web/src/components/ChartsCard/index.vue` -> `apps/web/src/modules/admin/ui/ChartsCard.vue`
    - `apps/web/src/components/ChartsCard/config.ts` -> `apps/web/src/modules/admin/ui/chartConfig.ts`
  - Updated usage:
    - `apps/web/src/pages/manage/charts/index.vue` now imports `@/modules/admin/ui/ChartsCard.vue`
  - Deleted old directory:
    - `apps/web/src/components/ChartsCard`
  - `docs/architecture/frontend-shared-ui-classification.md` and
    `docs/architecture/frontend-module-extraction-strategy.md` updated for P1.22 ownership closure.
  - Verification commands and results:
    - `rg "@/components/ChartsCard|components/ChartsCard|ChartsCard|DefaultChartOptions" apps/web/src -n`
      - Passed (`DefaultChartOptions` / `ChartsCard` now point to `apps/web/src/modules/admin/ui`).
    - `pnpm -C apps/web exec vue-tsc --noEmit`
      - Passed.
    - `pnpm -C apps/web build`
      - Passed (existing Vite CJS and Sass deprecation warnings only).
    - `git diff --check`
      - Passed (`LF will be replaced by CRLF` warnings on touched files).
- P1.23 completed: admin/charts route-boundary closure in place.
  - Moved `apps/web/src/pages/manage/charts/index.vue` to
    `apps/web/src/modules/admin/pages/AdminChartsPage.vue`.
  - Updated `apps/web/src/pages/manage/index.vue` to import and render `AdminChartsPage` on the `total` tab.
  - Deleted legacy directory `apps/web/src/pages/manage/charts`.
  - `docs/architecture/frontend-module-extraction-strategy.md`,
    `docs/architecture/frontend-shared-ui-classification.md` and `docs/agent-handoff.md`
    updated for P1.23.
  - Verification commands and results:
    - `rg "pages/manage/charts|\.\/charts/index\.vue|AdminChartsPage|ChartsCard" apps/web/src docs/architecture docs/agent-handoff.md -n`
      - Passed.
    - `pnpm -C apps/web exec vue-tsc --noEmit`
      - Passed.
    - `pnpm -C apps/web build`
      - Passed (existing Vite CJS and Sass deprecation warnings only).
    - `git diff --check`
      - Passed (`LF will be replaced by CRLF` warnings on touched files).
- P1.27 completed: package-owned interactive UI component protocol layer and app migration.
  - Added `packages/ui` as `@sun-world/ui` with protocol contracts, Vue implementations,
    subpath entries, docs, and tests for:
    - `SunButton`
    - `SunInput`
    - `SunDatePicker`
    - `SunList`
    - `SunPagination`
    - `SunTag`
    - `SunLoadingSkeleton`
    - `SunThemeProvider`
  - Added package PRD at `docs/architecture/frontend-ui-component-prd.md`.
  - Added root commands `pnpm test:ui` and `pnpm build:ui`; root `build` now builds UI first.
  - Migrated app usages from legacy button/input/tag/loading skeleton/date/pagination wrappers
    to package subpath imports such as `@sun-world/ui/button`.
  - Removed legacy component files now covered by package protocols:
    - `apps/web/src/components/ZBtn/*`
    - `apps/web/src/components/Tag/index.vue`
    - `apps/web/src/shared/ui/LoadingSkeleton.vue`
    - `apps/web/src/baseCom/btn/btn.vue`
    - `apps/web/src/baseCom/button/button.vue`
    - `apps/web/src/baseCom/input/input.vue`
  - Kept layout and richer Element Plus controls in app code where no package protocol exists yet
    (`ElSelect`, `ElDialog`, `ElInputNumber`, etc.).
  - Bundle discipline:
    - Runtime imports use component subpaths.
    - Component CSS is split into `base.css` plus per-component styles.
    - UI package library build has `cssCodeSplit: true` and emits per-component CSS assets.
    - Final dist scan found no unused `SunList` / `SunThemeProvider` signatures.
  - Verification commands and results:
    - `pnpm -C packages/ui test`
      - Passed: 9 files, 28 tests.
    - `pnpm -C packages/ui build`
      - Passed.
    - `pnpm -C apps/web exec vue-tsc --noEmit`
      - Passed.
    - `pnpm -C apps/web build`
      - Passed (existing Vite CJS and Element Plus Sass deprecation warnings only).
    - `rg "sun-list|data-sun-list-card|SunList|sun-theme-provider|SunThemeProvider" apps/web/dist -n`
      - Passed: no matches.
    - `rg 'ElButton|ElInput\\b|ElDatePicker|ElPagination|@/baseCom/(btn|button|input)|@/components/ZBtn|@/components/Tag|@/shared/ui/LoadingSkeleton|<z-btn|<ZBtn|<SwInput|<SwButton|<SwBtn|<Btn' apps/web/src -n`
      - Passed: no matches.
    - `git diff --check`
      - Passed (`LF will be replaced by CRLF` warnings on touched files).
- P1.28 in progress/completed locally: backend code is treated as a first-class
  monorepo app while production backend cutover remains separate.
  - Added implementation plan:
    - `docs/superpowers/plans/2026-06-19-api-monorepo-compose-contracts.md`
  - Formalized deployment state:
    - Backend source lives in `apps/api`.
    - Production backend still runs from `/home/lighthouse/blog/blog_end` until
      a deliberate cutover.
  - Added Docker Compose candidate:
    - `docker-compose.yml`
    - `frontend` is the default service and preserves `my-frontend` / `8081:80`.
    - `api` is behind the explicit `api` profile and binds
      `127.0.0.1:8000:8000`.
  - Added non-deploying verification:
    - `scripts/verify-compose.mjs`
    - `scripts/verify-compose.sh`
    - `scripts/check-api-migration.py`
    - `scripts/run-api-check.mjs`
  - Contracts package is now the official frontend/backend TypeScript boundary:
    - Added route constants, shared response/page types, and tests.
  - Python migration/optimization notes:
    - Removed tracked exploratory notebook `apps/api/llm study.ipynb`.
    - Hardened ignores for API runtime artifacts, local override config, caches,
      logs, uploads, and notebooks.
    - Updated `apps/api/Dockerfile` to install from `pyproject.toml` instead of
      the incomplete `requirements.txt`.
    - Moved `AsyncPostgresSaver` import into AI manager initialization to reduce
      import-time coupling.
  - Verification commands and results:
    - `pnpm -F @sun-world/contracts test`
      - Passed: 1 file, 2 tests.
    - `pnpm check:compose`
      - Passed locally via static fallback because Docker CLI is not installed.
    - Remote read-only check:
      - `ssh lighthouse@81.70.43.189 "docker --version && docker compose version && cd /home/lighthouse/blog/sun-world && pwd && git branch --show-current"`
      - Passed; server has Docker 29.2.1, Docker Compose v5.1.0, repo path is
        `/home/lighthouse/blog/sun-world`, branch is `main`.
    - Remote compose parse via stdin:
      - `docker compose --project-directory /home/lighthouse/blog/sun-world -f - config --quiet`
      - Passed; no file was written and no service was started.
    - `pnpm check:api`
      - Passed: 83 Python files compiled; repository boundary clean.
    - `pnpm -C apps/web exec vue-tsc --noEmit`
      - Passed.
    - `pnpm -C apps/web build`
      - Passed (existing Vite CJS and Element Plus Sass deprecation warnings only).
    - `git diff --check`
      - Passed (`LF will be replaced by CRLF` warnings on touched files).
- P1.40 completed locally: UI primitive runtime decoupling and entry preload
  guardrails.
  - Removed Element Plus runtime dependency from current package UI primitives:
    - `packages/ui/src/components/SunButton.vue`
    - `packages/ui/src/components/SunInput.vue`
    - `packages/ui/src/components/SunDatePicker.vue`
    - `packages/ui/src/components/SunPagination.vue`
  - Updated package UI styles and package metadata so `@sun-world/ui` no
    longer depends on Element Plus for primitive components.
  - Removed global full Element theme import from `apps/web/src/main.ts`.
  - Changed HTTP error notifications in `apps/web/src/service/http.ts` to
    lazy-load Element Message and its CSS only when a notification is shown.
  - Changed login/register pages to use `useRouter()` instead of importing the
    global compatibility router instance from route chunks.
  - Tightened Vite manual chunk rules in `apps/web/vite.config.ts`:
    - App-owned source rules now require `apps/web/src`.
    - `contracts` and `shared-api` are explicit shared chunks.
    - Third-party internals such as `element-plus/.../src/store` no longer get
      merged into app `stores`.
  - Extended `scripts/check-web-chunks.mjs` to reject:
    - Full Element theme import in `main.ts`.
    - Element runtime imports from `packages/ui/src/components`.
    - Entry HTML preloads for route-only or optional heavy chunks.
  - Current build evidence:
    - Entry HTML no longer preloads `element`, `tile-export`, `vditor-*`,
      `admin-charts`, `echarts`, `zrender`, `manage-shell`, or legacy page
      chunks.
    - `stores` chunk gzip is approximately `1.8 KiB`.
    - `manage-shell` chunk gzip is approximately `3.8 KiB`.
    - `entry-index-js` gzip is approximately `9.6 KiB`.
  - Verification commands and results:
    - `pnpm -C packages/ui test`
      - Passed: 9 files, 28 tests.
    - `pnpm -C apps/web build`
      - Passed (existing Vite CJS warning only).
    - `pnpm check:web:chunks`
      - Passed.
    - `pnpm check:web:budgets`
      - Passed.
    - `pnpm check:web`
      - Passed: contract route usage, legacy API entrypoint check, contracts
        tests, frontend type check, build, budgets, and chunk boundaries.
    - `pnpm check:api`
      - Passed: 87 Python files compiled; RUM protocol check passed.
    - `pnpm check:compose`
      - Passed via Docker build context check and static compose validation
        because Docker CLI is not installed locally. No deployment command was
        run.
    - `git diff --check`
      - Passed (`LF will be replaced by CRLF` warnings on touched files).
- P1.41 completed locally: percentile metrics for backend request and RUM Web
  Vitals.
  - Added request metrics protocol guard:
    - `scripts/check-request-metrics.py`
  - `apps/api/src/core/metrics.py` now keeps bounded request duration samples
    and exposes global plus per-route:
    - `p50_duration_ms`
    - `p95_duration_ms`
    - `p99_duration_ms`
  - `apps/api/src/core/rum_metrics.py` now keeps bounded Web Vital value
    samples and exposes:
    - `p50_value`
    - `p95_value`
    - `p99_value`
  - Updated Pydantic models:
    - `apps/api/src/type/admin_type.py`
    - `apps/api/src/type/telemetry_type.py`
  - Regenerated contracts:
    - `packages/contracts/openapi.json`
    - `packages/contracts/src/generated-api-types.ts`
  - Admin metrics UI now shows request p95/p99 in route rows, request p95 in
    overview cards, and Web Vitals p95/p99 in the RUM panel.
  - `scripts/run-api-check.mjs` now includes both request metrics and RUM
    protocol checks.
  - Verification commands and results:
    - `apps\api\.venv\Scripts\python.exe scripts\check-request-metrics.py`
      - First failed as expected on missing `p50_duration_ms`, then passed.
    - `apps\api\.venv\Scripts\python.exe scripts\check-rum-metrics.py`
      - First failed as expected on missing `p50_value`, then passed.
    - `apps\api\.venv\Scripts\python.exe scripts\export-openapi.py`
      - Passed.
    - `pnpm -F @sun-world/contracts exec openapi-typescript openapi.json -o src/generated-api-types.ts`
      - Passed.
    - `pnpm -F @sun-world/contracts test`
      - Passed.
    - `pnpm -C apps/web exec vue-tsc --noEmit`
      - Passed.
    - `pnpm check:api`
      - Passed: API migration check, request metrics protocol check, and RUM
        metrics protocol check.
    - `pnpm check:web`
      - Passed: contract route usage, legacy API entrypoint check, contracts
        tests, frontend type check, build, budgets, and chunk boundaries.
    - `pnpm check:compose`
      - Passed via Docker build context check and static compose validation
        because Docker CLI is not installed locally. No deployment command was
        run.
    - `git diff --check`
      - Passed (`LF will be replaced by CRLF` warnings on touched files).
- P1.42 completed locally: contracts route method/OpenAPI alignment guard.
  - Added `API_ROUTE_METHODS` in `packages/contracts/src/routes.ts` and
    exported it from `packages/contracts/src/index.ts`.
  - Extended `packages/contracts/src/index.spec.ts` so contracts tests verify:
    - every `API_ROUTES` value has method metadata.
    - every declared path/method exists in generated
      `packages/contracts/openapi.json`.
  - This closes a frontend-backend chain gap: module APIs already consume route
    constants, and route constants now prove they match backend OpenAPI paths
    and HTTP methods.
  - Verification commands and results:
    - `pnpm -F @sun-world/contracts test`
      - First failed as expected because `API_ROUTE_METHODS` was missing, then
        passed: 1 file, 3 tests.
    - `pnpm check:web`
      - Passed: contract route usage, legacy API entrypoint check, contracts
        tests, frontend type check, build, budgets, and chunk boundaries.
    - `pnpm check:api`
      - Passed: API migration check, request metrics protocol check, and RUM
        metrics protocol check.
    - `pnpm check:compose`
      - Passed via Docker build context check and static compose validation
        because Docker CLI is not installed locally. No deployment command was
        run.
    - `git diff --check`
      - Passed (`LF will be replaced by CRLF` warnings on touched files).
- P1.43 completed locally: metrics snapshot storage boundary.
  - Added `apps/api/src/core/metrics_store.py` with:
    - `MetricsSnapshotStore` protocol.
    - `InMemoryMetricsSnapshotStore` default implementation.
    - `JsonFileMetricsSnapshotStore` optional single-node snapshot history.
    - `build_metrics_snapshot_store()` controlled by `BLOG_METRICS_STORE`,
      `BLOG_METRICS_STORE_PATH`, and `BLOG_METRICS_STORE_HISTORY`.
  - Request metrics and RUM metrics now call `save_metrics_snapshot()` when
    admin snapshots are generated. Store failures are logged and do not break
    endpoint responses.
  - Added `scripts/check-metrics-store.py` and included it in
    `scripts/run-api-check.mjs`.
  - `.gitignore` now ignores default JSON snapshot runtime files at
    `data/metrics-snapshots.json` and
    `apps/api/data/metrics-snapshots.json`.
  - Updated observability/current-state/roadmap docs to distinguish snapshot
    persistence from future event-level Redis/Postgres analytics.
  - Verification commands and results:
    - `apps\api\.venv\Scripts\python.exe scripts\check-metrics-store.py`
      - First failed as expected because `src.core.metrics_store` was missing.
      - Then failed on import-time helper ordering.
      - Passed after moving global store initialization below helper
        definitions.
    - `pnpm check:api`
      - Passed: API migration check, metrics snapshot store protocol check,
        request metrics protocol check, and RUM metrics protocol check.
    - `git diff --check`
      - Passed (`LF will be replaced by CRLF` warnings on touched files).
- P1.44 completed locally: frontend build artifact manifest.
  - Added `scripts/generate-web-build-manifest.mjs` to scan
    `apps/web/dist/assets`, gzip JS/CSS assets, parse `index.html` references,
    and write generated `apps/web/dist/build-manifest.json`.
  - Added `scripts/check-web-build-manifest.mjs` and root
    `check:web:manifest`.
  - `scripts/check-web.mjs` now runs manifest generation and validation after
    the Vite build, before budgets and chunk boundary checks.
  - The manifest records schema version, app, dist dir, generated timestamp,
    total JS/CSS gzip, initial gzip, lazy JS gzip, and per-asset `isInitial`
    metadata. It is generated under ignored `dist` output and is not meant to
    be committed.
  - Verification commands and results:
    - `node scripts/check-web-build-manifest.mjs`
      - First failed as expected because
        `apps/web/dist/build-manifest.json` was missing.
    - `node scripts/generate-web-build-manifest.mjs`
      - Passed and wrote `apps/web/dist/build-manifest.json`.
    - `node scripts/check-web-build-manifest.mjs`
      - Passed.
    - `pnpm check:web:manifest`
      - Passed against the generated manifest.
    - `pnpm check:web`
      - Passed: contract route usage, legacy API entrypoint check, contracts
        tests, frontend type check, build, manifest generation/check, budgets,
        and chunk boundaries. Existing Vite CJS deprecation warnings remain.
    - `git diff --check`
      - Passed (`LF will be replaced by CRLF` warnings on touched files).
- P1.45 completed locally: cross-platform root `pnpm check`.
  - Added `scripts/check-root-check-script.mjs`.
    - It verifies root `package.json` uses
      `check: node scripts/check-all.mjs`.
    - It rejects `check*` scripts that depend on `bash`.
  - Added `scripts/check-all.mjs`.
    - Runs root script protocol, `git diff --check`, `pnpm check:web`,
      `pnpm check:api`, and `pnpm check:compose`.
    - Does not deploy and does not run public health probes.
  - Updated root `package.json`:
    - `check` now runs `node scripts/check-all.mjs`.
    - `check:root-script` runs the protocol guard.
  - Verification commands and results:
    - `node scripts/check-root-check-script.mjs`
      - First failed as expected because root `check` still used
        `bash scripts/check-all.sh`.
      - Passed after switching to the Node entrypoint.
    - `pnpm check`
      - Passed all 5 checks: root script protocol, git whitespace,
        frontend full check, backend API check, and compose static check.
        Existing Vite CJS deprecation and Windows CRLF conversion warnings
        remain.
- P1.46 completed locally: platform goal evidence audit.
  - Added `scripts/check-platform-goal-audit.mjs`.
    - Verifies root `check:platform` is configured.
    - Verifies root `scripts/check-all.mjs` runs the platform audit.
    - Verifies durable evidence exists for commit/push policy,
      frontend-backend chain, performance monitoring, UI package protocol,
      Docker Compose candidate, contracts, backend metrics/RUM storage,
      frontend telemetry, build manifest, and cross-platform verification.
  - Added root `check:platform`.
  - `scripts/check-all.mjs` now runs `pnpm check:platform` before
    `git diff --check`, `pnpm check:web`, `pnpm check:api`, and
    `pnpm check:compose`.
  - Verification commands and results:
    - `node scripts/check-platform-goal-audit.mjs`
      - First failed as expected because `check:platform` was missing and root
        `check-all` did not call it.
      - Passed after adding the script entry and root check integration.
    - `pnpm check`
      - Passed all 6 checks: root script protocol, platform goal audit, git
        whitespace, frontend full check, backend API check, and compose static
        check. Existing Vite CJS deprecation and Windows CRLF conversion
        warnings remain.
- P1.47 completed locally: local metrics alert threshold evaluator.
  - Added `apps/api/src/core/metrics_alerts.py`.
    - Builds alert rules from `BLOG_ALERT_*` environment variables.
    - Evaluates request error rate, request p95 latency, and Web Vital poor
      rate from aggregate snapshots.
    - Returns structured alert dictionaries and does not send notifications.
  - Added `scripts/check-metrics-alerts.py` and included it in
    `scripts/run-api-check.mjs`.
  - Updated platform audit to require `metrics_alerts.py` evidence.
  - Verification commands and results:
    - `apps\api\.venv\Scripts\python.exe scripts\check-metrics-alerts.py`
      - First failed as expected because `src.core.metrics_alerts` was missing.
      - Passed after adding the evaluator.
    - `pnpm check:api`
      - Passed: API migration check, metrics alert protocol check, metrics
        snapshot store protocol check, request metrics protocol check, and RUM
        metrics protocol check.
- P1.48 completed locally: admin alert read model and UI display.
  - Added `apps/api/src/core/admin_alerts.py`.
    - Assembles request/RUM threshold results into `AdminAlertsSnapshot`.
    - Keeps alert rule evaluation separate from admin response assembly so the
      storage/evaluator implementation can be replaced later.
  - Updated `apps/api/src/type/admin_type.py` and
    `apps/api/src/routers/admin/admin.py`.
    - New authenticated endpoint: `GET /admin/alerts`.
  - Updated contracts:
    - `packages/contracts/src/routes.ts` includes `API_ROUTES.admin.alerts`
      and `API_ROUTE_METHODS['admin.alerts']`.
    - `packages/contracts/openapi.json` and
      `packages/contracts/src/generated-api-types.ts` were regenerated.
  - Updated admin frontend:
    - `apps/web/src/modules/admin/api.ts`
    - `apps/web/src/modules/admin/types.ts`
    - `apps/web/src/modules/admin/composables/useAdminMetrics.ts`
    - `apps/web/src/modules/admin/pages/AdminMetricsPage.vue`
    - The page now loads request metrics, RUM metrics, and active alerts
      together, then displays active critical/warning alert rows.
  - Added `scripts/check-admin-alerts.py` and included it in
    `scripts/run-api-check.mjs`.
  - Updated platform audit to require admin alert evidence and latest P1.48
    documentation markers.
  - Verification commands and results:
    - `apps\api\.venv\Scripts\python.exe scripts\check-admin-alerts.py`
      - First failed as expected because `src.core.admin_alerts` was missing.
      - Passed after adding the read model.
    - `apps\api\.venv\Scripts\python.exe scripts\export-openapi.py`
      - Passed and regenerated `packages/contracts/openapi.json`.
    - `pnpm -F @sun-world/contracts exec openapi-typescript openapi.json -o src/generated-api-types.ts`
      - Passed.
    - `pnpm -F @sun-world/contracts test`
      - Passed.
    - `pnpm check:web`
      - Passed: route usage, legacy API guard, contracts tests, type check,
        frontend build, build manifest, budgets, and chunk boundaries.
    - `pnpm check:api`
      - Passed: API migration, admin alert, metrics alert, metrics store,
        request metrics, and RUM metrics protocol checks.
- P1.49 completed locally: avoid duplicate metrics snapshot writes in admin
  alert reads.
  - Updated `apps/api/src/core/metrics.py`.
    - `RequestMetricsCollector.snapshot()` and `get_request_metrics_snapshot()`
      now accept `persist=True` by default.
  - Updated `apps/api/src/core/rum_metrics.py`.
    - `RumMetricsCollector.snapshot()` and `get_rum_metrics_snapshot()` now
      accept `persist=True` by default.
  - Updated `apps/api/src/core/admin_alerts.py`.
    - `GET /admin/alerts` reads request/RUM snapshots with `persist=False`.
    - This avoids duplicate snapshot-history writes when the admin page
      concurrently refreshes metrics, telemetry, and alerts.
  - Updated `scripts/check-admin-alerts.py`.
    - Verifies that admin alert read-model assembly uses the non-persisting
      collector path.
  - Verification commands and results:
    - `apps\api\.venv\Scripts\python.exe scripts\check-admin-alerts.py`
      - First failed as expected because alert reads still used default
        persisting snapshots.
      - Passed after adding the `persist` flag and using `persist=False` in
        admin alert assembly.
- P1.50 completed locally: bounded admin metrics history read model.
  - Added `scripts/check-admin-metrics-history.py`.
    - First failed as expected because `src.core.metrics_history` was missing.
    - Verifies request/RUM history kind, bounded limit behavior, and defensive
      copy semantics for returned snapshots.
  - Added `apps/api/src/core/metrics_history.py`.
    - Builds a `MetricsHistorySnapshot` from the replaceable metrics snapshot
      store.
  - Updated `apps/api/src/core/metrics_store.py`.
    - Added `load_metrics_snapshot_history()`.
  - Updated `apps/api/src/type/admin_type.py` and
    `apps/api/src/routers/admin/admin.py`.
    - New authenticated endpoint:
      `GET /admin/metrics/history?kind=request|rum&limit=...`.
  - Updated contracts:
    - `packages/contracts/src/routes.ts` includes
      `API_ROUTES.admin.metricsHistory`.
    - `packages/contracts/openapi.json` and
      `packages/contracts/src/generated-api-types.ts` were regenerated.
  - Updated admin frontend:
    - `apps/web/src/modules/admin/api.ts`
    - `apps/web/src/modules/admin/types.ts`
    - `apps/web/src/modules/admin/composables/useAdminMetrics.ts`
    - `apps/web/src/modules/admin/pages/AdminMetricsPage.vue`
    - The admin metrics page now shows request/RUM history sample counts after
      refreshing current snapshots.
  - Updated platform audit to require metrics history evidence and P1.50
    documentation markers.
  - Verification commands and results:
    - `apps\api\.venv\Scripts\python.exe scripts\check-admin-metrics-history.py`
      - Passed after implementing the read model.
    - `apps\api\.venv\Scripts\python.exe scripts\export-openapi.py`
      - Passed after rerunning sequentially. A prior concurrent export/type
        generation attempt hit a transient Windows file-write error, so OpenAPI
        export and TS type generation should remain sequential.
    - `pnpm -F @sun-world/contracts exec openapi-typescript openapi.json -o src/generated-api-types.ts`
      - Passed.
    - `pnpm -F @sun-world/contracts test`
      - Passed.
    - `pnpm check:web`
      - Passed: route usage, legacy API guard, contracts tests, type check,
        frontend build, build manifest, budgets, and chunk boundaries.
      - Admin metrics chunk remains below budget at about 3.7 KiB gzip.
    - `pnpm check:api`
      - Passed: API migration, admin alert, admin metrics history, metrics
        alert, metrics store, request metrics, and RUM metrics checks.
- P1.51 completed locally: compact frontend build summary artifact.
  - Added `scripts/check-web-build-summary.mjs`.
    - First failed as expected because
      `apps/web/dist/build-summary.json` was missing.
    - Verifies summary schema, source manifest, totals, top assets, and
      machine-readable budget result fields.
  - Added `scripts/generate-web-build-summary.mjs`.
    - Consumes `apps/web/dist/build-manifest.json` and
      `apps/web/performance-budgets.json`.
    - Writes `apps/web/dist/build-summary.json` with total gzip fields, top 10
      largest assets, and budget results for CI/release trend retention.
  - Updated root `package.json`.
    - Added `build:web:summary`.
    - Added `check:web:summary`.
  - Updated `scripts/check-web.mjs`.
    - Runs build summary generation and validation after manifest validation
      and before performance budgets/chunk boundary checks.
  - Updated platform audit to require build summary scripts and P1.51
    documentation markers.
  - Verification commands and results:
    - `node scripts/check-web-build-summary.mjs`
      - First failed as expected because the summary artifact was missing.
    - `node scripts/generate-web-build-manifest.mjs; node scripts/generate-web-build-summary.mjs; node scripts/check-web-build-summary.mjs`
      - Passed and wrote `apps/web/dist/build-summary.json`.
- P1.52 completed locally: cross-platform contracts OpenAPI generation.
  - Added `scripts/check-contracts-generate-script.mjs`.
    - First failed as expected because `@sun-world/contracts`
      `generate:openapi` still used `bash scripts/generate-openapi.sh` and
      `scripts/generate-openapi.mjs` was missing.
    - Verifies contracts `generate:*` scripts do not depend on bash and that
      the Node OpenAPI wrapper exists.
  - Added `scripts/generate-openapi.mjs`.
    - Selects Python from `SUN_WORLD_API_PYTHON`, the local API virtualenv,
      `python`, or `python3`.
    - Calls `scripts/export-openapi.py` from the repository root.
  - Updated `packages/contracts/package.json`.
    - `generate:openapi` now runs `node ../../scripts/generate-openapi.mjs`.
  - Updated root `package.json` and `scripts/check-web.mjs`.
    - Added `check:contracts:generate`.
    - `pnpm check:web` now runs the contracts generate-script guard after
      contracts tests.
  - Updated documentation:
    - `docs/current-state.md`
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/architecture/api-contracts.md`
    - `packages/contracts/README.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
  - Verification commands and results:
    - `node scripts/check-contracts-generate-script.mjs`
      - First failed as expected; passed after switching to the Node wrapper.
    - `pnpm -F @sun-world/contracts run generate:openapi`
      - Passed and exported `packages/contracts/openapi.json`.
    - `pnpm -F @sun-world/contracts run generate`
      - Passed and regenerated OpenAPI plus TypeScript API types without bash.
- P1.53 completed locally: UI package minimal import and bundle boundary guard.
  - Added `scripts/check-ui-package-boundary.mjs`.
    - Verifies app code imports `@sun-world/ui` through documented component
      subpaths, not the package root or internal source paths.
    - Verifies each documented UI subpath has a package export and source entry.
    - Rejects a shared `ui.*` production web chunk so unused UI components are
      not pulled into the entry path.
  - Updated root `package.json` and `scripts/check-web.mjs`.
    - Added `check:web:ui-boundary`.
    - `pnpm check:web` now runs the UI boundary guard after build summary
      checks and before budgets/chunk checks.
  - Updated `apps/web/vite.config.ts`.
    - Removed manual chunk rules that forced all `packages/ui` source into a
      single `ui` chunk.
    - Added a production HTML post-filter that strips route-only optional heavy
      assets from generated `index.html` preload/stylesheet tags while keeping
      the route chunks available for dynamic imports.
  - Updated platform audit and docs:
    - `scripts/check-platform-goal-audit.mjs`
    - `docs/current-state.md`
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
  - Verification commands and results:
    - `node scripts/check-ui-package-boundary.mjs`
      - First failed as expected on the forced UI manual chunk and stale
        `ui.*` dist assets.
      - Passed after removing the UI manual chunk and rebuilding.
    - `node scripts/check-web-chunks.mjs`
      - Failed once after the UI chunk split because route-only CSS/JS was
        still referenced from `index.html`.
      - Passed after adding the production HTML route-only preload filter and
        rebuilding.
    - `pnpm -C apps/web build`
      - Passed after the Vite changes; existing Vite CJS deprecation warnings
        remain.
- P1.54 completed locally: root verification now runs UI package test/build.
  - Updated `scripts/check-platform-goal-audit.mjs`.
    - The platform audit now requires `scripts/check-all.mjs` to include both
      `test:ui` and `build:ui`.
    - The audit now expects P1.54 documentation markers.
  - Updated `scripts/check-all.mjs`.
    - Root `pnpm check` now runs `pnpm test:ui` and `pnpm build:ui` before the
      frontend app check.
    - This proves UI component protocol tests and package build outputs
      independently, rather than relying only on the consuming web bundle.
  - Updated documentation:
    - `docs/current-state.md`
    - `docs/architecture/platform-iteration-roadmap.md`
    - `docs/superpowers/plans/2026-06-19-platform-chain-monitoring-build-iteration.md`
  - Verification commands and results:
    - `node scripts/check-platform-goal-audit.mjs`
      - First failed as expected because `scripts/check-all.mjs` did not yet
        include `test:ui` or `build:ui`.
      - Passed after adding both checks to the root chain and updating docs.
    - `pnpm check`
      - Passed all 8 checks after the root chain started running UI package
        test/build: root script protocol, platform audit, whitespace, UI test,
        UI build, frontend full check, backend API check, and compose static
        check. Docker CLI remains unavailable locally, so compose validation is
        static only and no deployment command was run.
- Next step:
  - Continue monitoring persistence by deciding whether to store event-level
    RUM/request events in Redis or Postgres, then add notification delivery for
    alert results if a channel is selected.
  - Alternatively continue remaining shared primitive decisions (`Waterfall`
    first) after ownership boundaries stay explicit.
  - Backend production cutover remains a separate task; do not run
    `docker compose --profile api up`, restart `blog-api.service`, or change
    Nginx without explicit cutover approval.
- Remaining risks:
  - `InputBindingManager.addBinding()` same-id replace semantics remains
    deliberate; if later we need multiple runtime rules per id, we need a new
    merge strategy.
  - `packages/editor/dist/index.d.ts` is canonical now, but package API surface remains a partial boundary until full package-owned consumer-facing type contract is validated end-to-end.
  - Future global/runtime augmentations should prefer external-module + `declare global` + module-augmentation pattern, rather than script-mode `declare module '@vue/runtime-core'`.
  - `packages/icons/dist` is expected as build output and remains ignored/untracked for now; `@sun-world/icons` web alias still points to source during this phase.
  - `packages/icons` DTS generation no longer covers `src/App.vue`/demo files; it is now scoped to `src/index.ts` and `src/icons/**`.
  - `packages/icons` DTS include currently targets only `src/index.ts` and `src/icons/**`; if future public exports are added from `src/type.ts`, `src/constant.ts`, or other modules, extend dts include/exports together to avoid coverage gaps.

## Archived Handoff History

- Keep this section short for readability. Prior historical notes continue to live in prior `Current Handoff` entries and long-lived architecture docs.
