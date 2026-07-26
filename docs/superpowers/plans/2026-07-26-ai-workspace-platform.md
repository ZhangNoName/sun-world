# AI Workspace Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a versioned, persistent, multi-provider AI workspace with a reusable React AI UI package and compatibility-preserving FastAPI integration.

**Architecture:** Pydantic/OpenAPI defines REST DTOs and a small checked TypeScript/Python contract defines SSE frames. `apps/api/src/modules/ai` owns service/provider/persistence/security behavior, `packages/ai-ui` owns presentation and block rendering, and `apps/web/src/modules/ai` is the route/controller adapter. Legacy AI routes remain available while the Web route moves to `/ai/v1/*`.

**Tech Stack:** Python 3.11, FastAPI, Pydantic 2, httpx/LangChain OpenAI-compatible provider support, MySQL, Fernet; React 19, TypeScript, Vitest, Testing Library, Vite, ECharts, `@sun-world/ui`, `@sun-world/icons`.

## Global Constraints

- Preserve existing uncommitted user work and do not rewrite unrelated files.
- Use Node `24.17.0`, pnpm `10.15.1`, and `corepack pnpm` for project commands.
- New Web AI code uses `/ai/v1/*`; `/ai/chat*`, image routes, and Sun AI CLI remain compatible.
- API keys are write-only, encrypted at rest, absent from logs/browser storage/responses, and never committed.
- DeepSeek remains the server default; custom profiles support DeepSeek, OpenAI, OpenRouter, and OpenAI-compatible APIs.
- Guests use the server default without persistent history; authenticated users own persisted profiles, conversations, messages, and feedback.
- ECharts and AI route code stay lazy; all motion and translucency have accessibility fallbacks.

---

### Task 1: Versioned AI protocol and route contracts

**Files:**
- Create: `apps/api/src/modules/ai/__init__.py`
- Create: `apps/api/src/modules/ai/schemas.py`
- Create: `packages/contracts/src/ai.ts`
- Create: `packages/contracts/src/ai.spec.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/routes.ts`
- Modify after Pydantic routes exist: `packages/contracts/openapi.json`
- Modify after Pydantic routes exist: `packages/contracts/src/generated-api-types.ts`

**Interfaces:**
- Produces Python `AiBlock`, `AiMessage`, `AiConversation`, `AiProviderProfile`, request/response models, `AiStreamEvent`, and `encode_sse_event(event)`.
- Produces TypeScript `AI_PROTOCOL_VERSION`, discriminated `AiContentBlock`, `AiStreamEvent`, `isAiStreamEvent`, and route constants under `API_ROUTES.ai`.

- [ ] **Step 1: Write failing contract tests**

Add Vitest cases with literal fixtures for all block kinds, acceptance of protocol `1`, rejection of protocol `2`, and new route constants. Add `apps/api/tests/test_ai_schemas.py` cases proving `encode_sse_event` emits exactly one `data:` frame and rejects an unsafe `javascript:` link.

- [ ] **Step 2: Run tests and verify RED**

Run `corepack pnpm -F @sun-world/contracts test -- src/ai.spec.ts` and the available API Python against `apps/api/tests/test_ai_schemas.py`. Expect missing-module/export failures.

- [ ] **Step 3: Implement the protocol**

Use discriminated unions with these serialized block types: `text`, `table`, `chart`, `link`, `record`, and `custom`. Use stream event types `run.started`, `content.delta`, `component.upsert`, `message.completed`, and `run.failed`. Validate protocol version and sequence, and serialize SSE with `json.dumps(..., ensure_ascii=False)`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run both focused commands until they pass without warnings attributable to the new code.

### Task 2: Provider registry, encrypted profiles, and repositories

**Files:**
- Create: `apps/api/src/modules/ai/errors.py`
- Create: `apps/api/src/modules/ai/credentials.py`
- Create: `apps/api/src/modules/ai/providers.py`
- Create: `apps/api/src/modules/ai/repositories.py`
- Create: `apps/api/tests/test_ai_credentials.py`
- Create: `apps/api/tests/test_ai_providers.py`
- Create: `apps/api/tests/test_ai_repositories.py`
- Modify: `apps/api/src/database/mysql/schema_migration.py`

**Interfaces:**
- Produces `CredentialCipher.encrypt/decrypt`, `ProviderRegistry.resolve(profile)`, `AiProvider.stream(request)`, `InMemoryAiRepository`, and `MySqlAiRepository`.
- Repository methods require an explicit authenticated `user_id` for persistent data and enforce ownership internally.

- [ ] **Step 1: Write failing credential/provider/repository tests**

Cover write-only encrypted round-trip, missing encryption key, DeepSeek default resolution, OpenAI/OpenRouter/custom-compatible normalization, API-key redaction, conversation ordering, message sequencing, ownership denial, soft deletion, and feedback upsert. Schema tests require the four AI tables and JSON-compatible columns.

- [ ] **Step 2: Run tests and verify RED**

Run the three focused Python test files and `python apps/api/src/database/mysql/schema_migration.py --mode check`. Expect missing implementations/table contracts.

- [ ] **Step 3: Implement minimal domain infrastructure**

Use a provider descriptor registry and one OpenAI-compatible streaming adapter. Resolve default credentials from `DEEPSEEK_*`, then existing `AI_*`/OpenRouter/OpenAI variables. Use Fernet with `AI_CREDENTIAL_ENCRYPTION_KEY`; return only `has_api_key` and a non-secret hint. Parameterize every SQL value and use JSON serialization for blocks.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the focused Python tests plus static schema check. Confirm test output contains no fixture API key.

### Task 3: AI application service and FastAPI v1 router

**Files:**
- Create: `apps/api/src/modules/ai/service.py`
- Create: `apps/api/src/modules/ai/router.py`
- Create: `apps/api/tests/test_ai_service.py`
- Create: `apps/api/tests/test_ai_router.py`
- Modify: `apps/api/app_instance.py`
- Modify: `apps/api/src/routers/ai/ai.py`
- Modify: `apps/api/src/routers/ai/__init__.py`
- Modify: `scripts/export-openapi.py`
- Modify: `scripts/check-sun-ai-contract-sync.mjs`
- Modify: `scripts/run-api-check.mjs`

**Interfaces:**
- Produces `/ai/v1/providers`, `/ai/v1/provider-profiles`, `/ai/v1/conversations`, `/ai/v1/conversations/{conversation_id}`, `/ai/v1/messages/{message_id}`, `/ai/v1/messages/{message_id}/feedback`, and `/ai/v1/runs/stream`.
- `AiService.stream_run` yields valid `AiStreamEvent` objects with one terminal event and sanitized failures.
- Legacy `AiManager` entrypoints keep their current signatures.

- [ ] **Step 1: Write failing service/router tests**

Use the in-memory repository and a deterministic fake provider. Cover guest default streaming, authenticated persistence, profile ownership, edit-from-message truncation/continuation, regenerate, feedback, provider missing/rate-limit errors, disconnect cancellation, and no hard-coded user ID.

- [ ] **Step 2: Run tests and verify RED**

Run focused service/router tests. Expect missing service/router failures and then expected route failures.

- [ ] **Step 3: Implement service, dependencies, routes, and compatibility adapter**

Resolve users from optional/required auth dependencies, never payload IDs. Initialize the service after MySQL/auth managers without initializing a provider client. Emit sanitized `run.failed` after stream headers. Adapt old chat methods without changing Sun AI CLI payloads.

- [ ] **Step 4: Regenerate OpenAPI and run contract checks**

Run `corepack pnpm -F @sun-world/contracts generate`, `node scripts/check-sun-ai-contract-sync.mjs`, `node scripts/check-sun-ai-cli.mjs`, and focused API tests. Expect all to pass while no provider key is configured.

### Task 4: Reusable `@sun-world/ai-ui` package

**Files:**
- Create: `packages/ai-ui/package.json`
- Create: `packages/ai-ui/tsconfig.json`
- Create: `packages/ai-ui/vite.config.ts`
- Create: `packages/ai-ui/src/index.ts`
- Create: `packages/ai-ui/src/types.ts`
- Create: `packages/ai-ui/src/AiWorkspace.tsx`
- Create: `packages/ai-ui/src/AiMessageView.tsx`
- Create: `packages/ai-ui/src/AiBlockRenderer.tsx`
- Create: `packages/ai-ui/src/AiConversationSidebar.tsx`
- Create: `packages/ai-ui/src/AiComposer.tsx`
- Create: `packages/ai-ui/src/AiProviderSettings.tsx`
- Create: `packages/ai-ui/src/ai-ui.css`
- Create: `packages/ai-ui/src/AiWorkspace.test.tsx`
- Create: `packages/ai-ui/src/AiBlockRenderer.test.tsx`
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`

**Interfaces:**
- Produces controlled `AiWorkspace` props for conversations/messages/run state/actions/settings.
- Produces `AiRendererRegistry` and `AiBlockRenderer`, with application renderers taking precedence over built-ins.
- Consumes only public `@sun-world/contracts`, `@sun-world/ui`, and `@sun-world/icons/react` APIs.

- [ ] **Step 1: Read and follow the project icon skill before icon changes**

Use `.agents/skills/adding-sun-world-icons/SKILL.md`; add only missing action icons and validate package exports if needed.

- [ ] **Step 2: Write failing package behavior tests**

Cover accessible sidebar/composer, copy, edit/cancel/save, regenerate, like/dislike toggle, stop, settings key blank-on-open, safe link attributes, table semantics, unknown custom fallback, and a lazy chart loading boundary.

- [ ] **Step 3: Run package tests and verify RED**

Run `corepack pnpm -C packages/ai-ui test`. Expect missing package/components.

- [ ] **Step 4: Implement the package and styles**

Compose `@sun-world/ui` primitives. Keep all actions keyboard reachable and named. Render Markdown through the existing sanitized React Markdown stack. Dynamically import ECharts only inside the chart renderer and dispose the instance. Use token-driven light/dark styles, a 760px transcript measure, mobile overlay, press feedback, and reduced-motion/transparency/contrast fallbacks.

- [ ] **Step 5: Run package tests/build and verify GREEN**

Run the package test and build commands plus icon checks when icons changed.

### Task 5: Web controller, versioned SSE client, and route integration

**Files:**
- Rewrite: `apps/web/src/modules/ai/api.ts`
- Rewrite: `apps/web/src/modules/ai/sse.ts`
- Rewrite: `apps/web/src/modules/ai/composables/useAiChat.ts`
- Rewrite: `apps/web/src/modules/ai/pages/AigcPage.tsx`
- Replace with package import or remove: `apps/web/src/modules/ai/ui/AiComposer.tsx`
- Replace with package import or remove: `apps/web/src/modules/ai/ui/AiConversationSidebar.tsx`
- Replace with package import or remove: `apps/web/src/modules/ai/ui/AiMessageStream.tsx`
- Rewrite: `apps/web/src/modules/ai/pages/ai.css`
- Modify: `apps/web/src/modules/ai/types.ts`
- Modify: `apps/web/src/modules/ai/sse.test.ts`
- Modify: `apps/web/src/modules/ai/composables/useAiChat.test.tsx`
- Modify: `apps/web/src/modules/ai/pages/AigcPage.test.tsx`
- Modify: `scripts/check-ai-interface.mjs`

**Interfaces:**
- `useAiChat` exposes exhaustive load/run/error state plus controlled callbacks required by `AiWorkspace`.
- The SSE parser emits validated `AiStreamEvent` objects, ignores duplicate IDs, detects sequence gaps, and never interprets provider text as HTML.

- [ ] **Step 1: Write failing parser/controller/page tests**

Cover chunk boundaries, CRLF, event IDs, duplicate frames, sequence gaps, terminal enforcement, abort silence, stale-run isolation, conversation reload, settings save redaction, edit/regenerate, copy/feedback callbacks, provider errors, and package-owned UI rendering.

- [ ] **Step 2: Run focused Web tests and verify RED**

Run the three AI test files with `corepack pnpm -F @sun-world/blog test:react -- ...`. Expect failures for versioned events and package integration.

- [ ] **Step 3: Implement transport/controller integration**

Use generated REST request/response types and shared route constants. Fetch streams with cookies and an AbortSignal. Normalize non-stream errors through the shared error model. Protect state from earlier runs completing after a conversation switch. Keep only sidebar width in local storage; never persist prompts, responses, or credentials there.

- [ ] **Step 4: Run focused tests/typecheck and verify GREEN**

Run focused AI tests, `corepack pnpm -F @sun-world/blog typecheck`, and `node scripts/check-ai-interface.mjs`.

### Task 6: Documentation, comprehensive verification, and visual QA

**Files:**
- Create: `docs/architecture/ai-workspace-platform.md`
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`
- Modify: `docs/handoff/branches/feat-aigc-ui-polish.md`
- Modify if required by new env names: `docs/architecture/secrets-and-env.md`
- Modify: `README.md`

**Interfaces:**
- Documents provider setup by environment-variable name only, protocol/versioning, package usage, migration compatibility, schema apply command, and rollback boundaries.

- [ ] **Step 1: Document the implemented architecture and operations**

Include `AI_CREDENTIAL_ENCRYPTION_KEY`, provider variable names, static and database migration commands, guest/auth behavior, key rotation limitation, and the legacy endpoint deprecation path without any secret values.

- [ ] **Step 2: Run narrow and comprehensive verification**

Run AI package tests/build, contract tests/generation checks, focused API tests, `corepack pnpm check:api`, focused Web tests/typecheck, `corepack pnpm check:web`, `corepack pnpm format:check`, and `git diff --check`. Report unrelated pre-existing failures separately.

- [ ] **Step 3: Perform local browser QA**

At desktop and 390x844, verify empty state, new chat, stream/stop, error/retry, sidebar collapse/overlay/resize, copy, edit, regenerate, feedback, settings key clearing, table/link/chart blocks, dark/light themes, keyboard focus, no horizontal overflow, and no console errors. Do not call production AI endpoints.

- [ ] **Step 4: Update handoff with exact evidence**

Record goal, status, files, commands, pass/fail results, blockers, migration/deploy state, and next step. Do not commit, push, deploy, or apply the production database migration unless separately authorized.
