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

## Addendum: Blog List Search, Sorting, And Waterfall

### Current Goal

Make the public blog list default to newest-first ordering, support keyword
search and sort modes, and make the waterfall view render real blog data rather
than the old social-feed mock fields.

### Status

- Implemented locally on branch `codex/ai-cli-skills`.
- Not committed, pushed, or deployed yet.
- Backend `/blogs/` now accepts `keyword`, `sortBy`, and `sortOrder` query
  parameters and defaults to `updated_at desc`.
- Backend list queries filter `COALESCE(is_deleted, 0) = 0`.
- Backend delete now updates the `blog` table instead of the old `blogs` table,
  which should allow cleanup of the half-created `id=19` row after deployment.
- Frontend blog list now has a search input, sort selector, and real data
  waterfall toggle.
- Waterfall cards now render blog title, abstract, category, tags, publish
  time, and view count. They no longer use `cover_url`, author, likes, or image
  mock data.
- Temporary per-post tags from the 20 generated posts are visually folded into
  `前端基础` and `算法基础` in the blog list/tag cloud while production data cleanup
  is pending.

### Important Files Touched

- `apps/api/src/controller/blog_manage.py`
- `apps/api/src/routers/blog/blog.py`
- `apps/web/src/components/Waterfall/waterfall.vue`
- `apps/web/src/modules/blog/api.ts`
- `apps/web/src/modules/blog/composables/useBlogList.ts`
- `apps/web/src/modules/blog/types.ts`
- `apps/web/src/modules/blog/ui/BlogHomeFeed.vue`
- `scripts/check-blog-list-query.py`
- `scripts/check-blog-waterfall-real-data.mjs`
- `scripts/check-web.mjs`
- `scripts/run-api-check.mjs`

### Commands Run

- `python scripts/check-blog-list-query.py`
- `node scripts/check-blog-waterfall-real-data.mjs`
- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm check:contracts:generate`
- `pnpm check:api`
- `pnpm format`
- `pnpm format:check`
- `pnpm check:web`
- `git diff --check`
- Local Vite smoke:
  `pnpm -C apps/web dev -- --host 127.0.0.1 --port 5173`
  and `http://127.0.0.1:5173/` returned HTTP 200.

### Verification Result

- New backend query protocol check passed.
- New waterfall real-data protocol check passed.
- `pnpm check:api` passed.
- `pnpm check:web` passed, including type check, production build, budgets, and
  chunk checks.
- `git diff --check` passed with Windows CRLF conversion warnings only.
- Local Vite dev server is running on `http://127.0.0.1:5173/` from process
  `14464` at the time of this note.

### Blockers

- Production API still runs the old code until this branch is committed, pushed,
  merged/deployed. Public API checks against `https://api.sunworld.site/blogs/`
  therefore still show the old unsorted behavior.
- Production tag cleanup still needs an operational database action after
  deployment. Recommended cleanup: merge/remove the temporary
  `frontend-basic-01..10` and `algorithm-basic-01..10` associations in favor of
  series-level tags, then delete orphan tag rows.

### Next Suggested Step

Review the diff, commit/deploy the code change, then run production cleanup for
the half-created `id=19` record and the temporary per-post tags once the fixed
delete/list behavior is live.

## Addendum: Homepage-Only ICP Filing Card

### Current Goal

Move the ICP filing display out of global desktop/mobile layout chrome and show
it only on the homepage as a card after the left-side weather card.

### Status

- Implemented locally on branch `codex/ai-cli-skills`.
- Not committed, pushed, or deployed yet.
- Added a reusable homepage ICP card component with the filing text
  `豫ICP备2024081960号` and official MIIT link.
- Desktop homepage renders the card after `WeatherCard`.
- Mobile homepage renders the same card in the homepage content because the
  left sidebar is hidden on narrow screens.
- Removed the global filing link from the desktop footer and mobile layout.
- Updated compliance notes in `AGENTS.md` and `docs/current-state.md`.

### Important Files Touched

- `AGENTS.md`
- `apps/web/src/layout/footer/index.vue`
- `apps/web/src/layout/mobLayout.vue`
- `apps/web/src/modules/home/pages/HomePage.vue`
- `apps/web/src/modules/home/ui/IcpFilingCard.vue`
- `docs/current-state.md`
- `docs/handoff/branches/codex-ai-cli-skills.md`
- `scripts/check-icp-home-card.mjs`
- `scripts/check-web.mjs`

### Commands Run

- `node scripts/check-icp-home-card.mjs` failed before implementation, then
  passed after the change.
- `pnpm format`
- `pnpm format:check`
- `pnpm -C apps/web exec vue-tsc --noEmit`
- `pnpm check:web`
- `git diff --check`
- Local Vite smoke: `http://127.0.0.1:5173/` returned HTTP 200.

### Verification Result

- Homepage ICP card protocol check passed.
- `pnpm check:web` passed, including type check, production build, budgets, and
  chunk checks.
- `git diff --check` passed with Windows CRLF conversion warnings only.

### Blockers

- Production still uses the old global footer/mobile filing placement until the
  local changes are committed, pushed, and deployed.

### Next Suggested Step

Review the homepage on desktop and mobile widths, then deploy this branch when
ready.

## Addendum: Hide Public AI Entry Before Review

### Current Goal

Hide public navigation entry points into the AIGC page before review, while
keeping the direct `/aigc` route available for owner testing.

### Status

- Implemented locally on branch `codex/ai-cli-skills`.
- Removed the desktop header AI icon and the search icon that opened `/aigc`.
- Removed the mobile bottom navigation AI tab and drawer link.
- Cleared the AI module `nav` registration so future module-driven navigation
  does not expose `/aigc`.
- Added `scripts/check-ai-public-entry-hidden.mjs` and wired it into
  `pnpm check:web`.
- The AIGC page still calls backend `/ai/chat_stream`; it does not directly
  spawn the local Sun AI CLI from the browser. The Sun AI CLI remains a command
  line client for the same backend API path.

### Important Files Touched

- `apps/web/src/layout/header/index.vue`
- `apps/web/src/layout/mobLayout.vue`
- `apps/web/src/modules/ai/index.ts`
- `scripts/check-ai-public-entry-hidden.mjs`
- `scripts/check-web.mjs`
- `docs/handoff/branches/codex-ai-cli-skills.md`

### Commands Run

- `node scripts/check-ai-public-entry-hidden.mjs` failed before implementation,
  then passed after the change.
- `pnpm format`
- `pnpm check:api`
- `pnpm check:web`
- `pnpm format:check`
- `git diff --check`

### Verification Result

- `pnpm check:api` passed.
- `pnpm check:web` passed, including the new AI public entry hidden check.
- `pnpm format:check` passed.
- `git diff --check` passed with Windows CRLF conversion warnings only.

### Blockers

- None locally. Production still exposes the existing AI entry points until this
  branch is merged and deployed.

### Next Suggested Step

Open a draft PR from `codex/ai-cli-skills` to `main`.
