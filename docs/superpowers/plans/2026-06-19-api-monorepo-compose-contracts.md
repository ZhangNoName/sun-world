# API Monorepo Compose Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/api` a first-class monorepo application with clear frontend/backend contracts, safe Docker Compose deployment configuration, and a Python migration health check without cutting production over.

**Architecture:** Keep `apps/web` and `apps/api` as independently deployable applications. Use `packages/contracts` as the TypeScript API contract boundary for frontend consumers, while the Python backend remains the OpenAPI source of truth. Add Docker Compose as a safe orchestration entry where the frontend is default and the API is opt-in.

**Tech Stack:** Vue 3/Vite/pnpm workspace, FastAPI/Python, OpenAPI TypeScript contracts, Docker Compose, Bash verification scripts.

---

### Task 1: Formalize API Migration State

**Files:**
- Modify: `docs/current-state.md`
- Modify: `docs/architecture/project-architecture.md`
- Modify: `deploy/README.md`
- Modify: `deploy/backend/README.md`
- Modify: `docs/agent-handoff.md`

- [ ] **Step 1: Update docs to distinguish code migration from production cutover**

Record that backend code is now part of the monorepo under `apps/api`, while production may still run from `/home/lighthouse/blog/blog_end` until a deliberate cutover.

- [ ] **Step 2: Preserve production safety rules**

Ensure docs say not to restart `blog-api.service`, change Nginx, or switch production traffic during this task.

### Task 2: Harden API Repository Boundaries

**Files:**
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Modify: `apps/api/.gitignore`
- Modify: `apps/api/README.md`
- Modify: `apps/api/Dockerfile`

- [ ] **Step 1: Ignore backend runtime artifacts**

Ignore `.venv`, `__pycache__`, pytest/mypy/ruff caches, logs, local override config, notebooks used for exploration, and upload/runtime output.

- [ ] **Step 2: Keep Docker build context lean**

Exclude backend and frontend caches from Docker context while keeping source files, lockfiles, and deployment configs available to builds.

- [ ] **Step 3: Improve API image build hygiene**

Keep the API image self-contained, avoid secrets in the image, and make `start.sh` executable during image build.

### Task 3: Make Contracts the Official Frontend Boundary

**Files:**
- Modify: `packages/contracts/README.md`
- Modify: `packages/contracts/package.json`
- Modify: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/http.ts`
- Create: `packages/contracts/src/routes.ts`
- Create: `packages/contracts/src/shared.ts`
- Create: `packages/contracts/src/index.spec.ts`

- [ ] **Step 1: Write contract tests**

Add tests that verify stable route constants, shared envelope/page types, and public exports.

- [ ] **Step 2: Verify tests fail before implementation**

Run `pnpm -F @sun-world/contracts test` and confirm it fails because the new modules do not exist yet.

- [ ] **Step 3: Add minimal contract modules**

Add route constants, shared response/page/error types, and exports without adding a runtime HTTP client.

- [ ] **Step 4: Verify contract tests pass**

Run `pnpm -F @sun-world/contracts test`.

### Task 4: Add Safe Compose and Verification Scripts

**Files:**
- Create: `docker-compose.yml`
- Create: `scripts/verify-compose.sh`
- Modify: `package.json`
- Modify: `deploy/README.md`
- Modify: `deploy/frontend/README.md`
- Modify: `deploy/backend/README.md`

- [ ] **Step 1: Write a Compose verification test script**

Add a script that runs `docker compose config`, checks service names, and optionally checks remote/server readiness without starting containers.

- [ ] **Step 2: Add Compose config**

Define `frontend` as the default service. Define `api` under `profiles: ["api"]`, bound to `127.0.0.1:8000:8000`, with secrets referenced by path only.

- [ ] **Step 3: Add root scripts**

Add `compose:config`, `check:compose`, `build:api`, and `test:contracts`.

### Task 5: Python Migration Health Check and Low-Risk Optimization Review

**Files:**
- Create: `scripts/check-api-migration.py`
- Modify: `scripts/check-api.sh`
- Modify: `apps/api/app_instance.py` only for low-risk import/config improvements if the check reveals a concrete issue.

- [ ] **Step 1: Add migration health check**

Check for forbidden runtime artifacts, dangerous tracked secret filenames, required health/readiness routes, and compile all Python files without importing runtime managers.

- [ ] **Step 2: Run the check**

Run `pnpm check:api`. If it fails, inspect root cause before modifying Python code.

- [ ] **Step 3: Apply only low-risk Python improvements**

Allowed changes are startup/config validation, import hygiene, and obvious dead-runtime artifacts. Do not refactor business controllers or database managers in this task.

### Task 6: Final Verification

**Files:**
- All touched files.

- [ ] **Step 1: Run package and app checks**

Run:

```bash
pnpm -F @sun-world/contracts test
pnpm check:compose
pnpm check:api
pnpm -C apps/web exec vue-tsc --noEmit
pnpm -C apps/web build
git diff --check
```

- [ ] **Step 2: Confirm no production deployment occurred**

Do not run `docker compose up`, `docker rm`, `docker restart`, `systemctl restart`, or Nginx reload commands.

- [ ] **Step 3: Update handoff**

Record changed files, verification results, remaining cutover steps, and Python optimization observations in `docs/agent-handoff.md`.
