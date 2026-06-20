# codex/ai-cli-skills Handoff

## Current Goal

Design and implement the first-phase Sun World AI agent access layer: a local
CLI plus repository-scoped Skill.md instructions that call existing Python API
model capabilities through stable contracts. Current extension: make the AI
web interface use the same API boundary with a GPT-style chat layout and
server-side DeepSeek-compatible defaults.

## Status

- Branch codex/ai-cli-skills was created from main.
- Stale tracked file nginx000.conf was removed and committed as
  8a50348b chore: remove stale nginx config.
- Research completed: MCP is the likely second-phase standard tool layer;
  first phase should be CLI + Skill.md, with MCP added later as a separate
  adapter.
- First-phase CLI + Skill.md implementation is complete on this branch.
- The AI page has been rebuilt as a GPT-style chat shell with focused
  components for the sidebar, top bar, message stream, and composer.
- The web UI posts through the existing frontend API helpers; it does not run
  the CLI directly in the browser. CLI, skills, and the UI share the Python
  API as the stable model boundary.
- The backend LLM config now prefers server-side DeepSeek-compatible
  environment variables, with OpenRouter/OpenAI-compatible fallbacks. No real
  provider token is stored in the repository.
- AI stream rendering was fixed after local testing showed the backend and
  Vite proxy returned SSE tokens but the UI updated a raw assistant message
  object that Vue did not reliably track. Stream token/status updates now
  replace the assistant message through the reactive conversation state.

## Important Files Touched

- nginx000.conf deleted.
- docs/agent-handoff.md split into a short active entrypoint.
- docs/handoff/README.md documents the handoff split protocol.
- docs/handoff/archive/2026-06-20-platform-checkpoints.md stores historical
  handoff entries.
- docs/handoff/branches/codex-ai-cli-skills.md stores this branch's active
  state.
- docs/superpowers/specs/2026-06-20-sun-ai-cli-skill-design.md records the
  approved design.
- docs/superpowers/plans/2026-06-20-sun-ai-cli-skill.md records the
  implementation plan.
- tools/sun-ai-cli/src/ contains the Sun AI CLI.
- scripts/check-sun-ai-contract-sync.mjs checks OpenAPI route drift.
- scripts/check-sun-ai-cli.mjs checks CLI behavior against a fake local API.
- .agents/skills/sun-world-ai/ contains the repository-scoped skill.
- package.json, scripts/run-api-check.mjs, and
  scripts/check-platform-goal-audit.mjs wire the checks into project
  verification.
- docs/superpowers/specs/2026-06-20-ai-chat-interface-provider-design.md
  records the AI interface/provider design.
- docs/superpowers/plans/2026-06-20-ai-chat-interface-provider.md records the
  AI interface implementation plan.
- apps/api/src/llm/config.py reads DeepSeek/OpenAI-compatible provider
  settings from server environment variables.
- apps/web/src/modules/ai/pages/AigcPage.vue is the AI page shell.
- apps/web/src/modules/ai/composables/useAiChat.ts owns AI chat state and
  streaming sends.
- apps/web/src/modules/ai/ui/AiComposer.vue,
  apps/web/src/modules/ai/ui/AiConversationSidebar.vue,
  apps/web/src/modules/ai/ui/AiMessageStream.vue, and
  apps/web/src/modules/ai/ui/AiTopBar.vue keep UI files small.
- Unused legacy AI UI files `ChatInput.vue`, `ChatList.vue`,
  `ConfigModal.vue`, and `ModelName.vue` were removed after confirming they
  had no runtime references.
- scripts/check-ai-interface.mjs guards the AI page structure and keeps client
  source free of secret-like tokens.
- scripts/check-ai-interface.mjs also guards against raw assistant message
  mutation in streaming callbacks, so token rendering cannot regress silently.

## Commands Run

- git switch -c codex/ai-cli-skills
- git add -- nginx000.conf
- git commit -m "chore: remove stale nginx config"
- Research used current web docs for MCP, Codex Skills, Claude Skills,
  FastMCP OpenAPI, LangChain OpenAPI Toolkit, Composio, and Pipedream.

## Verification Result

- Current branch was clean after the stale Nginx config commit.
- `node --check scripts/check-platform-goal-audit.mjs` passed.
- `node scripts/check-platform-goal-audit.mjs` passed.
- `git diff --check` passed with Windows CRLF conversion warnings only.
- Pending verification for the new archive-auto-commit rule will be recorded in
  the commit that saves this protocol update.
- `pnpm sun-ai inspect` passed.
- `pnpm check:sun-ai:contracts` passed.
- `pnpm check:sun-ai:cli` passed.
- `pnpm check:api` passed and now runs the Sun AI CLI checks before Python API
  checks.
- `python scripts/check-llm-config-env.py` passed.
- `pnpm check:ai-interface` passed.
- `pnpm format:check` passed.
- `pnpm check:api` passed after the AI interface/provider changes.
- `pnpm check:web` passed after the AI interface/provider changes.
- `git diff --check` passed with Windows CRLF conversion warnings only.
- Local Vite smoke used
  `pnpm -C apps/web exec vite --host 127.0.0.1 --port 5174 --strictPort`;
  `http://127.0.0.1:5174/aigc` returned HTTP 200.
- Frontend stream rendering fix verification:
  - `pnpm check:ai-interface` failed before the fix on raw assistant message
    mutation, then passed after the fix.
  - `pnpm format:check` passed.
  - `pnpm -C apps/web exec vue-tsc --noEmit` passed.
  - `pnpm check:web` passed.
  - Local API `/ai/chat_stream` returned HTTP 200 with SSE `token` chunks.
  - Stale local Vite servers on ports 5173 and 5174 were stopped; keep using
    the primary dev URL `http://127.0.0.1:3000/aigc`.

## Blockers

- Browser automation through the in-app browser was unavailable in this
  session because the node_repl browser bridge returned
  `codex/sandbox-state-meta: missing field sandboxPolicy`.
- A real model response requires setting a valid provider key such as
  `DEEPSEEK_API_KEY` in the API server environment. Do not store provider
  tokens in repository files or handoff docs.

## Next Suggested Step

Run the API server with the provider key set in its environment, open the
frontend `/aigc` page, and send a prompt through the composer. After this
first-phase UI/CLI boundary has been used in practice, decide whether to add
MCP as a second-phase adapter.
