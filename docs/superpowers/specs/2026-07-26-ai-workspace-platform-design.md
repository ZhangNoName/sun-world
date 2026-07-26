# AI Workspace Platform Design

## Goal

Turn `/aigc` from a page-local chat demo into a reusable AI workspace foundation:

- a versioned frontend/backend protocol that can carry text and structured UI blocks;
- an isolated FastAPI AI module with provider, persistence, credential, and streaming boundaries;
- a reusable React package, `@sun-world/ai-ui`, that owns the AI workspace presentation;
- user-scoped model/provider settings, encrypted API-key storage, saved conversations, and message feedback;
- GPT-like copy, edit, regenerate, stop, like, and dislike interactions with useful error recovery.

The first release deliberately supports chat and structured result rendering. Graph/agent builders and record-library screens consume the same contracts later instead of being embedded into this page now.

## Current-State Findings

The current Web module stores conversations only in React state and consumes an unversioned `data: {token}` stream. The FastAPI router owns request models inline, uses a hard-coded `user_id = 2`, and delegates to one lazy legacy LangGraph agent. Provider models are module-level objects. There is no user provider profile, credential encryption, message feedback, conversation repository, or structured render payload.

The existing `@sun-world/ui` chat shell/composer are useful generic primitives, but they are not an AI product package. The route should depend on an AI-specific package while generic controls remain in `@sun-world/ui`.

## Considered Approaches

### 1. Extend the existing page and `AiManager`

This is the smallest patch, but keeps protocol, state, provider selection, persistence, and presentation tangled across the route and old `src/llm` directory. It makes charts/agents harder to add and preserves the hard-coded user boundary. Rejected.

### 2. Replace the AI stack in one incompatible cutover

This gives clean names immediately, but breaks the existing Sun AI CLI and deployed clients and makes migration difficult to verify. Rejected.

### 3. Versioned modular core with compatibility adapters

Create `src/modules/ai` as the backend product module and `@sun-world/ai-ui` as the frontend package. Introduce `/ai/v1/*` routes and a typed SSE event envelope, while retaining the old `/ai/chat*` endpoints as adapters until clients migrate. Provider profiles and conversation persistence sit behind repositories. Selected because it creates durable boundaries without forcing a risky all-at-once cutover.

## Architecture

```text
apps/web/src/modules/ai
  route adapter + API client + workspace controller
             |
             v
packages/ai-ui                 packages/contracts
  AI presentation + registry <-> generated REST DTOs + AI stream protocol
             |                           ^
             v                           |
apps/api/src/modules/ai
  router -> service -> provider registry -> provider adapter
                  \-> repository -> MySQL
                  \-> credential cipher
```

### Package boundaries

- `@sun-world/contracts` owns public route constants and transport types. REST DTOs continue to originate in Pydantic/OpenAPI. The manually exported stream envelope is small, versioned, and checked against backend fixture output because OpenAPI does not describe SSE frames.
- `apps/api/src/modules/ai` owns all AI domain behavior. Routers validate/authorize, the service coordinates runs, providers translate model APIs, repositories persist, and the cipher encrypts credentials. Provider response bodies and keys never cross into logs or browser-readable responses.
- `@sun-world/ai-ui` owns responsive workspace layout, conversation navigation, composer, message presentation, actions, settings dialog, render registry, and accessible feedback. It receives data and callbacks; it does not know API URLs, cookies, persistence technology, or provider secrets.
- `apps/web/src/modules/ai` adapts the generated API/stream protocol to `@sun-world/ai-ui`, owns abort/race handling, and lazy-loads the AI route.

## Protocol

All new stream frames use protocol version `1`:

```json
{
  "version": "1",
  "event_id": "evt_...",
  "type": "content.delta",
  "conversation_id": "conv_...",
  "message_id": "msg_...",
  "sequence": 2,
  "created_at": "2026-07-26T12:00:00Z",
  "data": { "delta": "hello" }
}
```

Supported event types are `run.started`, `content.delta`, `component.upsert`, `message.completed`, and `run.failed`. Sequence numbers are monotonically increasing per run. A terminal event occurs exactly once. The client ignores duplicate event IDs and rejects unsupported protocol versions with a recoverable upgrade message.

Messages contain ordered blocks rather than one content string:

- `text`: plain or Markdown text;
- `table`: columns and row records;
- `chart`: an ECharts option object plus accessible summary;
- `link`: label, URL, and optional description;
- `record`: typed generated output metadata for future saved artifacts;
- `custom`: a namespaced component name and JSON payload for application-provided renderers.

Unknown blocks render a safe fallback card showing the component type, never raw HTML. Links use safe URL validation and prevent opener access.

## Provider and credential model

Built-in provider descriptors are `deepseek`, `openai`, `openrouter`, and `openai-compatible`. DeepSeek is the default and resolves from server environment variables. A provider profile contains provider, display name, base URL, model, enabled/default flags, and encrypted credential metadata.

Authenticated users may create profiles. API keys are write-only: responses expose only `has_api_key` and a short non-secret hint. Encryption uses Fernet with `AI_CREDENTIAL_ENCRYPTION_KEY`; when it is missing, the default server provider still works, while saving a personal key fails with an actionable configuration error. Keys, prompts, generated content, provider response bodies, and full base URLs are excluded from logs.

Guests can use the server default provider without persistent history. Authenticated users receive persisted conversations, messages, provider profiles, and feedback. User identity comes only from the auth dependency; request payloads never select a user ID.

Provider adapters implement one interface for complete and streaming generation. The first production adapter is OpenAI-compatible and covers DeepSeek, OpenAI, OpenRouter, and custom compatible endpoints. The registry is designed for a future native Gemini/Anthropic adapter without changing routes or UI contracts.

## Persistence

The conservative MySQL schema adds:

- `ai_provider_profiles`, indexed by user and default status;
- `ai_conversations`, indexed by user/update time and soft deletion;
- `ai_messages`, indexed by conversation/sequence and storing blocks as JSON;
- `ai_message_feedback`, unique per user/message.

The repository interface also has an in-memory implementation for unit tests and guest runs. Database writes are parameterized. Conversation/message updates verify ownership in the repository, and editing a user message creates a new run from that point instead of silently mutating an already generated answer.

## Interface and interaction design

The workspace uses three calm layers: a compact conversation rail, a readable centered transcript, and a floating composer. The route remains full-screen and works in both design families. Desktop keeps a resizable/collapsible sidebar; mobile uses an interruptible overlay with a scrim and visible close path. Motion uses short opacity/transform feedback and respects reduced-motion/transparency preferences.

Each assistant message exposes copy, regenerate, like, dislike, and more actions after content appears. Each user message exposes copy and edit. Copy and feedback confirm success without shifting layout. Editing opens the content inline, preserves keyboard/focus behavior, and allows cancel. Stop aborts the run immediately. Retry is placed beside an inline error card that explains whether the problem is authentication, provider setup, rate limiting, network loss, or an unexpected server failure without leaking internals.

The settings sheet shows built-in/default provider status and user profiles. The key field is blank on every open and is sent only when explicitly replaced. The page never caches keys in local storage or returns them from the API.

## Error model

Backend domain errors use stable codes: `AI_AUTH_REQUIRED`, `AI_PROVIDER_NOT_CONFIGURED`, `AI_CREDENTIAL_ENCRYPTION_UNAVAILABLE`, `AI_PROVIDER_UNAVAILABLE`, `AI_RATE_LIMITED`, `AI_STREAM_INTERRUPTED`, `AI_PROTOCOL_UNSUPPORTED`, and `AI_RESOURCE_NOT_FOUND`. Stream failures use a sanitized `run.failed` frame when headers have already been sent. REST failures use the repository response envelope.

The client maps codes to specific recovery actions: sign in, open settings, retry, or start a new chat. Aborts and route unmounts are silent user cancellations. Partial assistant content remains visible after network loss and is marked interrupted.

## Compatibility and migration

- Keep `/ai/chat`, `/ai/chat_stream`, `/ai/chat-chunk-stream`, image routes, and Sun AI CLI behavior during this phase.
- New Web code uses `/ai/v1/*` only.
- The legacy `AiManager` becomes a compatibility adapter over the new service or remains isolated until its image/agent paths are migrated.
- The route stays lazy, and ECharts loads only when a chart block is rendered.
- Existing generic chat primitives remain exported by `@sun-world/ui`; `@sun-world/ai-ui` composes them and owns all AI-specific behavior.

## Testing and verification

- Protocol tests cover every block and stream event, duplicate/sequence handling, malformed JSON, and unsupported versions.
- Backend unit tests cover provider resolution, credential redaction/encryption behavior, guest/default selection, ownership, persistence, feedback upsert, and sanitized failures.
- Router/OpenAPI checks prove the new routes and DTOs are exported without provider initialization.
- Package tests cover semantic actions, inline editing, settings key behavior, safe links, unknown block fallback, table rendering, and lazy chart mounting.
- Web hook/page tests cover streaming, abort, stale-run protection, retry, feedback, copy, persisted history, and mobile/sidebar behavior.
- Required gates are the focused tests, `check-sun-ai-contract-sync`, `check-sun-ai-cli`, `check:api`, `check:ai-interface`, Web typecheck/tests, package build, `check:web`, formatting, and `git diff --check`.

## Deliberate non-goals

- A visual graph/agent builder, workflow execution editor, attachment upload pipeline, billing, token accounting, and a full artifact library are not built in this slice.
- Native Anthropic/Gemini wire adapters are not included until their distinct streaming/tool semantics are needed; the registry boundary is included now.
- Production database migration and deployment are not run from the local refactor without explicit deployment approval.
