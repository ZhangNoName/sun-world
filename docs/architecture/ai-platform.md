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
  mcp_router -> mcp_service -> policy gateway / repository / credential cipher

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

The V1 API exposes provider descriptors, per-user provider profiles, personas,
prompt-only skills, conversation summaries/details, message editing, feedback,
streaming runs, and an explicit MCP control plane. MySQL stores:

- `ai_provider_profiles`
- `ai_personas`
- `ai_skills`
- `ai_conversations`
- `ai_messages` (JSON block payloads and message order)
- `ai_message_feedback`
- `ai_mcp_connections`
- `ai_mcp_tools`
- `ai_mcp_tool_calls` (metadata-only audit records)

Repository methods scope every saved resource by authenticated `user_id`.
Guest runs are allowed but are not stored as another user's data. On a first
authenticated turn, the client replaces its temporary conversation ID with
the ID from `run.started`; later turns therefore retain history. Editing or
regenerating from a parent user message truncates later messages before the
new assistant response is saved. Message sequence allocation, truncation,
editing, and conversation touch operations use one owner-scoped transaction
with row locks. A Redis lease keyed by the server-resolved conversation ID
allows only one provider run per conversation across workers; a client cannot
split the lock with mismatched parent/conversation IDs. Storage failures end
the stream with `run.failed` and never claim a message was completed.

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

Every provider hostname must match the independent
`AI_PROVIDER_ALLOWED_HOSTS` policy. Calls use fresh all-public DNS validation,
IP pinning with the original TLS SNI/Host, no redirects or environment proxy,
bounded time/response/output tokens, and Redis-backed guest/account run-rate
limits. An empty allowlist or unavailable limiter fails closed before a paid
provider request is sent.

Run protection is charged only after request validation and atomically covers
short-window principal/global limits plus 24-hour guest-IP, guest-global,
authenticated-user, and site-global budgets. Global concurrency has an
expiring distributed lease. The default guest-global budget and maximum output
tokens place an application-side upper bound on anonymous output; production
must additionally configure the provider account's hard daily/monthly spending
cap because application counters are not a billing system. Guest and saved
transcripts are length-bounded.

## Personal Capabilities

Authenticated users can select one persona and up to eight prompt-only skills
for a run. Both are bounded declarative Markdown instructions scoped by
`user_id`; they are never interpreted as executable code or repository-level
Codex skills. Platform safety precedes persona, skills, conversation history,
and the current user message.

MCP is intentionally separate from prompt composition. The current release
supports user-owned HTTPS Streamable HTTP connections, explicit tool discovery,
and manual calls that require `confirmed: true`. It does not expose tools to the
model or perform autonomous calls. Endpoints must pass the server allowlist,
fresh DNS/public-address checks, redirect/proxy restrictions, and time/byte
limits. Optional bearer tokens are Fernet-encrypted; responses expose only a
masked hint, and audit rows contain argument key names plus result type/size,
not values or full results.

Connection configuration uses monotonic revisions. A config change
transactionally invalidates the cached tool catalog, discovery binds a fresh
catalog to the current revision, and tool calls verify that revision before
recording a `pending` audit row. Completion records `succeeded`, `failed`, or
`unknown`; unknown calls are not automatically replayed. User/IP/global rate
limits, a global concurrency lease, and hard operation deadlines apply
independently from chat-run limits.

The full identity, account-association, persona/skill, and MCP boundary is in
`docs/architecture/identity-and-ai-capabilities.md`.

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
6. Keep MCP invocation explicit until a separately reviewed agent-policy layer
   defines tool permissions, confirmation, prompt-injection handling, and
   per-tool data egress rules.

The implementation design and execution history are recorded in
`docs/superpowers/specs/2026-07-26-ai-workspace-platform-design.md` and
`docs/superpowers/plans/2026-07-26-ai-workspace-platform.md`.
