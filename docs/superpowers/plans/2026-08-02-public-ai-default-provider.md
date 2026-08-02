# Public AI Default Provider Implementation Plan

> **Status:** Completed locally on 2026-08-02. Provider seed applied and
> verification completed; no deployment, commit, push, or staging performed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove mock AI providers, store exactly one encrypted global DeepSeek default in MySQL, allow anonymous users to chat without login, and keep anonymous conversation state only for the current page.

**Architecture:** The existing global provider catalog becomes the source of truth for the public default provider and stores only encrypted credentials server-side. User profiles remain optional overrides for authenticated users. Anonymous runs use the existing local conversation id and an in-process bounded guest transcript; authenticated conversations continue using MySQL persistence.

**Tech Stack:** FastAPI, Pydantic, MySQL, Fernet credential encryption, React, TypeScript, Vitest, Python unittest.

## Global Constraints

- Never place the real DeepSeek API key in source, tests, logs, plans, docs, or frontend responses.
- Use the repository's declared toolchain: `corepack pnpm` for frontend commands and `apps/api/.venv/Scripts/python.exe` for API commands.
- Do not require authentication for `GET /ai/v1/providers` or `POST /ai/v1/runs/stream`.
- Do not persist anonymous conversations or anonymous feedback/messages in MySQL.
- Preserve authenticated user profiles and authenticated conversation persistence.
- Remove code-level provider fallback/mock data; an empty database configuration must return a clear `AI_PROVIDER_NOT_CONFIGURED` failure.
- Do not stage, commit, reset, or deploy because the worktree already contains unrelated user changes.

---

### Task 1: Lock the failing behavior with regression tests

**Files:**
- Modify: `apps/api/tests/test_auth_manager.py`
- Modify: `apps/api/tests/test_ai_router.py`
- Modify: `apps/api/tests/test_ai_service.py`
- Modify: `apps/api/tests/test_ai_repositories.py`
- Modify: `apps/web/src/modules/ai/composables/useAiChat.test.tsx`
- Modify: `packages/ai-ui/src/AiWorkspace.test.tsx`

**Interfaces:**
- Consumes the current auth manager, AI service/repository, and AI workspace behavior.
- Produces executable expectations for: `check_redis=False` skipping Redis, stale optional cookies degrading to guest, a DB-backed global provider resolving for anonymous users, no provider fallback when the DB is empty, and local guest conversation ids being sent to the stream.

- [ ] **Step 1: Write failing tests for the auth boundary.** Add a test with a valid JWT and a Redis double whose `exist()` raises; `verify_token(token, check_redis=False)` must still return the subject. Add a router test where optional auth raises a Redis timeout and the stream dependency resolves `user_id=None` instead of returning a server error.

- [ ] **Step 2: Run the focused API tests and verify the expected failures.**

  Run from `apps/api`:

  ```powershell
  .venv\Scripts\python.exe -m unittest tests.test_auth_manager tests.test_ai_router -v
  ```

  Expected: the new tests fail because blacklist access is unconditional and optional auth does not downgrade dependency failures.

- [ ] **Step 3: Write failing tests for the provider source of truth.** Add repository/service tests that seed one encrypted global catalog credential and assert anonymous resolution uses it; add an empty-catalog test asserting `AI_PROVIDER_NOT_CONFIGURED` instead of built-in DeepSeek/OpenAI/OpenRouter descriptors. Add frontend tests asserting the hook starts with no provider fallback and sends its local conversation id.

- [ ] **Step 4: Run the focused provider/frontend tests and verify they fail for the intended missing behavior.**

  ```powershell
  .venv\Scripts\python.exe -m unittest tests.test_ai_repositories tests.test_ai_service -v
  corepack pnpm exec vitest run --config vitest.config.ts src/modules/ai/composables/useAiChat.test.tsx ../../packages/ai-ui/src/AiWorkspace.test.tsx --testTimeout 20000
  ```

### Task 2: Make optional authentication safe for public AI routes

**Files:**
- Modify: `apps/api/src/controller/auth_manager.py`
- Modify: `apps/api/src/modules/ai/router.py`
- Test: `apps/api/tests/test_auth_manager.py`
- Test: `apps/api/tests/test_ai_router.py`

**Interfaces:**
- `AuthManager.verify_token(token, token_type='access', check_redis=False)` skips all Redis checks while preserving the existing refresh-token safety rule.
- `get_optional_ai_user_id(request)` returns `None` for invalid, expired, stale, or temporarily unverifiable cookies so public AI requests remain guest requests.

- [ ] **Step 1: Implement the smallest auth fix.** Change the blacklist branch to `if (check_redis or token_type == 'refresh') and self.is_token_blacklisted(token):`; wrap optional AI token parsing/user lookup in a narrow `try/except Exception` that returns `None` without logging token contents.

- [ ] **Step 2: Run the auth/router tests.**

  ```powershell
  .venv\Scripts\python.exe -m unittest tests.test_auth_manager tests.test_ai_router -v
  ```

  Expected: all auth and optional-public-AI tests pass.

### Task 3: Store and resolve one encrypted global provider configuration

**Files:**
- Modify: `apps/api/src/database/mysql/schema_migration.py`
- Modify: `apps/api/src/modules/ai/schemas.py`
- Modify: `apps/api/src/modules/ai/repositories.py`
- Modify: `apps/api/src/modules/ai/service.py`
- Modify: `apps/api/tests/test_ai_repositories.py`
- Modify: `apps/api/tests/test_ai_service.py`

**Interfaces:**
- Extend `ai_provider_catalog` with nullable `api_key_ciphertext` and `api_key_hint` columns; the public response models never expose ciphertext.
- Add `get_default_provider_record() -> tuple[AiProviderCatalog, str] | None` to the repository boundary, selecting the first enabled catalog row with an encrypted key.
- `AiService._resolve_provider_config()` uses a user default profile first, then the global catalog credential for authenticated and anonymous requests, and raises `AI_PROVIDER_NOT_CONFIGURED` when neither exists.
- `AiService.list_providers()` returns only enabled database catalog rows and never calls static provider descriptors when the catalog is empty.

- [ ] **Step 1: Add the schema contract and in-memory test support.** Add the two catalog columns to `MYSQL_SCHEMA`; keep `AiProviderCatalog` response fields unchanged; store encrypted global credentials only inside repository implementation/test state.

- [ ] **Step 2: Implement MySQL and in-memory default-record reads.** Select metadata plus ciphertext internally, decrypt only inside `AiService`, and preserve the existing user-profile precedence when a logged-in user explicitly selects a personal profile.

- [ ] **Step 3: Remove service fallback behavior.** Replace `ProviderRegistry.resolve_default()` usage for workspace runs with the repository global record; keep provider construction in `ProviderRegistry.create()` only. Return a domain failure when the database has no configured default.

- [ ] **Step 4: Run the repository/service tests and schema contract tests.**

  ```powershell
  .venv\Scripts\python.exe -m unittest tests.test_ai_repositories tests.test_ai_service tests.test_ai_providers -v
  ```

### Task 4: Remove frontend mock providers and preserve anonymous page conversations

**Files:**
- Modify: `packages/ai-ui/src/AiWorkspace.tsx`
- Modify: `apps/web/src/modules/ai/composables/useAiChat.ts`
- Modify: `apps/web/src/modules/ai/composables/useAiChat.test.tsx`
- Modify: `packages/ai-ui/src/AiWorkspace.test.tsx`

**Interfaces:**
- `AiWorkspace` defaults `providers` to an empty array instead of a hard-coded DeepSeek provider.
- `useAiChat` starts with an empty provider list and replaces it only from `GET /ai/v1/providers`.
- Guest stream payloads include the current local conversation id; no guest conversation API calls are made.

- [ ] **Step 1: Remove `fallbackProviders` and the hook's initial hard-coded provider.** Keep saved user profiles and server provider descriptors as the only model sources.

- [ ] **Step 2: Send local conversation ids for anonymous runs.** Change the stream payload to pass `conversationId` instead of converting local ids to `null`; the backend will use the id only in ephemeral memory when no user is authenticated.

- [ ] **Step 3: Add a bounded in-process guest transcript in `AiService`.** Key it by the supplied conversation id, append user/assistant text blocks, cap the transcript to a fixed recent-message limit, and never call repository persistence for `user_id=None`.

- [ ] **Step 4: Run frontend AI tests and package type checks.**

  ```powershell
  corepack pnpm exec vitest run --config vitest.config.ts src/modules/ai/composables/useAiChat.test.tsx ../../packages/ai-ui/src/AiWorkspace.test.tsx --testTimeout 20000
  corepack pnpm exec tsc -p tsconfig.app.json --noEmit
  ```

### Task 5: Clear provider mock data and seed the single encrypted DeepSeek default

**Files:**
- Create: `scripts/seed-ai-default-provider.py`
- Modify: `apps/api/src/modules/ai/repositories.py` only if the seed helper shares a repository-safe SQL operation
- Test: `apps/api/tests/test_ai_repositories.py`

**Interfaces:**
- The seed command reads the API key from a process environment variable, reads the existing configured credential-encryption key, encrypts the key with `CredentialCipher`, deletes all rows from `ai_provider_profiles` and `ai_provider_catalog`, then inserts exactly one enabled `deepseek` catalog row with `deepseek-chat` and the official HTTPS endpoint.
- The command prints only row counts and provider metadata; it must never print the API key, ciphertext, or key hint.

- [ ] **Step 1: Add a dry-run-capable seed command.** Require an explicit `DEEPSEEK_API_KEY` environment variable, fail if encryption is unavailable, use parameterized SQL, and support `--apply` so a read-only dry run is the default.

- [ ] **Step 2: Test the SQL intent without real credentials.** Use a fake connection/cursor and a generated Fernet key to assert deletes happen before the single insert and sensitive values are absent from command output.

- [ ] **Step 3: Run the dry run, inspect its sanitized plan, then apply it once using the user-provided key through the process environment only.** Verify with a read-only query that `ai_provider_catalog` has exactly one row (`deepseek`) and `ai_provider_profiles` has zero rows.

### Task 6: Verify the full public-chat path

**Files:**
- Modify: `apps/api/tests/test_ai_router.py` if an end-to-end dependency test needs a final assertion
- Modify: `docs/current-state.md` only if the project’s operational state needs a non-secret note about the public AI default

- [ ] **Step 1: Run all focused API and frontend tests plus formatting/type checks.**

  ```powershell
  .venv\Scripts\python.exe -m unittest discover -s tests -p 'test_ai*.py' -v
  corepack pnpm exec vitest run --config vitest.config.ts src/modules/ai src/components --testTimeout 20000
  corepack pnpm exec prettier --check src/modules/ai packages/ai-ui/src apps/web/src/modules/ai
  corepack pnpm exec tsc -p tsconfig.app.json --noEmit
  ```

- [ ] **Step 2: Exercise the running API without a login cookie.** Verify `GET /ai/v1/providers` returns exactly one DeepSeek descriptor and `POST /ai/v1/runs/stream` emits `run.started`, content events, and `message.completed` without exposing credentials.

- [ ] **Step 3: Exercise the same stream with a stale/invalid cookie.** Verify it behaves identically to the guest request and does not block on Redis.

- [ ] **Step 4: Run the production build if the focused checks pass.**

  ```powershell
  corepack pnpm --filter @sun-world/blog run build
  ```
