# AI Chat Interface And Provider Design

## Goal

Upgrade the Sun World AI page into a GPT-like chat interface and make it share
the same backend AI capability path as the `sun-ai` CLI. Default provider
configuration should support DeepSeek/OpenAI-compatible APIs through server-side
environment variables.

## Security Boundary

API keys must never be committed, rendered into the frontend bundle, written to
docs, or stored in handoff files. DeepSeek defaults are configured by variable
names only:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_MODEL`

The frontend can display provider/model labels, but it must not accept or store
provider tokens in browser state.

## Architecture

The browser cannot safely execute the local CLI. Instead, the UI and CLI both
call the same FastAPI AI routes.

```text
apps/web/src/modules/ai
  -> /ai/chat_stream or /ai/chat

tools/sun-ai-cli
  -> /ai/chat_stream or /ai/chat

apps/api/src/llm/config.py
  -> provider env resolution
  -> LangChain/OpenAI-compatible model initialization
```

This keeps model credentials server-side while making UI and CLI behavior drift
visible through the existing API and Sun AI checks.

## UI Design

The AI page should feel like a compact ChatGPT-style workspace:

- Left rail with new chat, search input, and recent sessions.
- Main header with active provider/model and connection state.
- Center message stream with user/assistant roles, timestamps, empty state
  prompts, loading state, and retry/error affordance.
- Bottom composer with multiline input, send button, Enter-to-send, and
  Shift+Enter newline.
- Responsive layout: sidebar collapses on mobile, message width stays readable,
  and controls do not overlap.

The page should be a working product surface, not a marketing hero.

## Provider Design

Backend provider resolution should prefer DeepSeek values, then existing
OpenRouter/OpenAI-compatible values for backwards compatibility:

```text
base_url = DEEPSEEK_BASE_URL or AI_URL
api_key = DEEPSEEK_API_KEY or OPENROUTER_API_KEY or OPENAI_API_KEY
chat_model = DEEPSEEK_MODEL or AI_CHAT_MODEL or current default
provider = AI_MODEL_PROVIDER or "openai"
```

No provider module should force API key initialization during API startup.
Lazy model creation remains required.

## Verification

Minimum checks:

- Backend provider config check proves DeepSeek env names are supported without
  printing secrets.
- Frontend AI interface check proves the GPT-like surface still uses module AI
  APIs, exposes no token field, and keeps copy/sizing protocols.
- `pnpm check:api`
- `pnpm check:web` when feasible.
- Local dev smoke check with a local API and web server when feasible.
