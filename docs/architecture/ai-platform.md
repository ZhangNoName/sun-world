# AI Platform Architecture

Sun World AI is a versioned application platform rather than a page-specific
chat client. The backend owns provider access, credentials, persistence, and
run orchestration; the reusable frontend package owns interaction and content
rendering; the Web app is only an adapter between them.

## Module Boundaries

```text
packages/contracts/src/ai.ts
  versioned stream events and renderable content blocks

apps/api/src/modules/ai/
  router -> service -> provider registry / repository / credential cipher

packages/ai-ui/
  workspace shell, message actions, provider settings, block renderers

apps/web/src/modules/ai/
  typed HTTP/SSE adapter and application state controller
```

Legacy `/ai/chat*` endpoints remain mounted for compatibility. New work must
use `/ai/v1/*` and `@sun-world/ai-ui`; application-local copies of the chat UI
are intentionally removed.

## Protocol V1

Every SSE frame is a JSON `AiStreamEvent` with `version`, stable `event_id`,
`conversation_id`, `message_id`, monotonic `sequence`, `created_at`, `type`,
and `data`. A run emits one terminal event.

| Event | Purpose |
|---|---|
| `run.started` | Resolves the persistent conversation and active provider/model. |
| `content.delta` | Appends streamed text. |
| `component.upsert` | Adds or updates a structured render block. |
| `message.completed` | Supplies the authoritative final block list. |
| `run.failed` | Supplies a stable error code, safe message, and retryability. |

The parser rejects unsupported versions, malformed events, duplicate IDs, and
sequence gaps. Existing text streaming is one valid producer of the protocol,
not the protocol itself.

## Render Blocks

V1 supports `text`, `table`, `chart`, `link`, `record`, and namespaced
`custom` blocks. Markdown is sanitized, links are protocol-checked, and
ECharts loads only when a chart is rendered. Products can extend
`AiRendererRegistry` for custom blocks without changing the workspace shell.
Unknown custom blocks degrade to an explicit unsupported-component card.

Future graph, agent, artifact, and saved-generation features should emit
versioned blocks or introduce a new protocol version. They should not embed
provider-specific response objects in UI components.

## API And Persistence

The V1 API exposes provider descriptors, per-user provider profiles,
conversation summaries/details, message editing, feedback, and streaming
runs. MySQL stores:

- `ai_provider_profiles`
- `ai_conversations`
- `ai_messages` (JSON block payloads and message order)
- `ai_message_feedback`

Repository methods scope every saved resource by authenticated `user_id`.
Guest runs are allowed but are not stored as another user's data. On a first
authenticated turn, the client replaces its temporary conversation ID with
the ID from `run.started`; later turns therefore retain history. Editing or
regenerating from a parent user message truncates later messages before the
new assistant response is saved.

## Providers And Credentials

The default provider is resolved server-side in this order: DeepSeek,
OpenRouter, OpenAI, then an unconfigured DeepSeek descriptor. Provider keys
are never exposed to or bundled in the frontend.

Authenticated users may save an HTTPS base URL, model, provider type, and API
key. Keys are encrypted with Fernet using
`AI_CREDENTIAL_ENCRYPTION_KEY`; API responses expose only `has_api_key` and a
masked suffix. The browser clears its password field whenever settings open
and never stores keys in local/session storage. A profile without a key stays
bound to its selected provider/model and fails explicitly if that provider
requires a key; it never silently sends a different provider's key.

## Extension Rules

1. Add protocol types and validation in `packages/contracts/src/ai.ts` and the
   backend Pydantic schemas first.
2. Add backend orchestration behind `AiService`; routers should only translate
   HTTP and authentication concerns.
3. Add a package renderer or register a namespaced custom renderer. Keep
   product-specific data fetching outside presentational renderers.
4. Regenerate OpenAPI/types and add protocol, backend, package, adapter, and
   error-path tests.
5. Keep credentials server-side and persist durable task state through the
   repository boundary.

The implementation design and execution history are recorded in
`docs/superpowers/specs/2026-07-26-ai-workspace-platform-design.md` and
`docs/superpowers/plans/2026-07-26-ai-workspace-platform.md`.
