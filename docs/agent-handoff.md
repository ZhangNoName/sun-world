## Current Handoff

This file is the short active handoff entrypoint. Keep it concise so branch
merges stay easy. Put branch-specific work in docs/handoff/branches/ and move
older completed checkpoints to docs/handoff/archive/.

## Active Branches

- feat/aigc-ui-polish: see
  docs/handoff/branches/feat-aigc-ui-polish.md.
- codex/ai-cli-skills: see
  docs/handoff/branches/codex-ai-cli-skills.md.
- codex/server-side-web-build: see
  docs/handoff/branches/codex-server-side-web-build.md.
- codex/md-editor-v3-migration: see
  docs/handoff/branches/codex-md-editor-v3-migration.md.

## Latest Stable Checkpoint

- Current task addendum (2026-07-01, blog feed back-to-top):
  - Goal: add a one-click back-to-top control while scrolling the blog list.
  - Status: implemented locally on branch `codex/md-editor-v3-migration`.
  - Important files touched:
    - `apps/web/src/modules/blog/ui/BlogHomeFeed.vue`
    - `scripts/check-blog-infinite-scroll.mjs`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - Blog home feed listens to `.app-container` scroll position.
    - A fixed circular back-to-top button appears after 360px of vertical
      scrolling and smooth-scrolls the app container to top.
    - The button is offset above mobile bottom navigation.
    - `scripts/check-blog-infinite-scroll.mjs` guards the scroll root,
      threshold, accessible label, and smooth scroll behavior.
  - Verification:
    - `corepack pnpm exec node scripts/check-blog-infinite-scroll.mjs` passed.
    - `corepack pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `corepack pnpm format:check` passed.
    - `git diff --check` passed with only LF/CRLF warnings.
    - `corepack pnpm check:web` passed.

- Current task addendum (2026-07-01, AI public entry):
  - Goal: expose the AI chat interface entry while keeping `/aigc` as the
    existing full-screen AI workspace.
  - Status: implemented locally on branch `codex/md-editor-v3-migration`.
  - Important files touched:
    - `apps/web/src/layout/header/index.vue`
    - `apps/web/src/layout/mobLayout.vue`
    - `apps/web/src/modules/ai/index.ts`
    - `scripts/check-ai-public-entry-visible.mjs`
    - `scripts/check-web.mjs`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - Desktop header shows a `bot` icon that navigates to `/aigc`.
    - Mobile bottom navigation and drawer expose `/aigc`.
    - AI module nav registration exposes `{ label: 'AI', path: '/aigc', icon: 'bot' }`.
    - The old hidden-entry guard was replaced with
      `scripts/check-ai-public-entry-visible.mjs`.

- Current task checkpoint (2026-07-01, md-editor-v3 migration):
  - Goal: replace Vditor runtime editor/preview usage in blog authoring and
    public article detail with md-editor-v3.
  - Status: in-progress on branch `codex/md-editor-v3-migration`.
  - Important files touched:
    - `apps/web/src/modules/blog/pages/ArticleEditorPage.vue`
    - `apps/web/src/modules/blog/composables/useBlogAuthoring.ts`
    - `apps/web/src/modules/blog/composables/useBlogReader.ts`
    - `apps/web/src/modules/blog/pages/BlogDetailPage.vue`
    - `apps/web/vite.config.ts`
    - `scripts/check-web.mjs`
    - `scripts/check-web-chunks.mjs`
    - `scripts/check-md-editor-v3-migration.mjs`
    - `scripts/check-blog-detail-render.mjs`
    - `apps/web/performance-budgets.json`
    - `apps/web/package.json`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - `ArticleEditorPage` uses shared component `<SunMarkdownEditor v-model="blogContent" />`.
    - The authoring page imports the Element Plus select/option component CSS it
      uses directly and sizes md-editor-v3 through the shared editor component,
      fixing the oversized select-caret / bottom-pinned editor visual regression.
    - `BlogDetailPage` uses shared component `<SunMarkdownPreview :content="blogInfo.content" />`.
    - `SunMarkdownPreview` emits catalog/rendered events; `useBlogReader`
      consumes those events for catalog state and active-heading scroll setup.
    - md-editor-v3 read/write chunks are now anchored to shared markdown components and
      validated as `md-editor-preview`/`md-editor-editor`.
    - The blog module no longer idle-preloads `BlogDetailPage`, so the public
      shell does not warm `md-editor-preview` before an article route needs it.
  - Verification:
    - `corepack pnpm exec node scripts/check-md-editor-v3-migration.mjs` passed.
    - `corepack pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `corepack pnpm format:check` passed.
    - `git diff --check` passed with only LF/CRLF warnings.
    - `corepack pnpm check:web` passed, including frontend build, chunk checks,
      migration checks, and performance budgets.
    - Browser visual check on local `/new_article` confirmed normal select
      caret sizing and editor placement.

- Latest task addendum (2026-06-20, P1.80 lazy AI manager startup):
  - Goal: keep the persistent backend container alive even when AI provider
    keys are missing or incomplete.
  - Evidence:
    - GitHub Actions run `27865319566` built the API image successfully and
      reached the candidate health check.
    - New candidate diagnostics showed the container exited with
      `openai.OpenAIError: The api_key client option must be set...`.
    - The stack trace showed startup imported `AiManager`, then `TestAgent`,
      then `src.llm.tools`, then `src.llm.model.gemma`, which initialized an
      OpenAI-compatible model at import time.
  - Status: committed, pushed, deployed, and verified.
  - Important files touched:
    - `apps/api/src/controller/ai_manager.py`
    - `scripts/check-ai-manager-lazy.py`
    - `scripts/run-api-check.mjs`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - `AiManager` no longer imports `src.llm.agent` or `src.llm.model.*` at
      module import time.
    - Startup creates an `AiManager` shell with the existing checkpointer, but
      instantiates the chat agent or image model only when an AI endpoint is
      called.
    - `pnpm check:api` now runs `scripts/check-ai-manager-lazy.py` so the
      startup path cannot regress to eager provider-key initialization.
  - Verification:
    - `python scripts/check-ai-manager-lazy.py` passed.
    - `pnpm check:api` passed with the new lazy-import guard.
    - `python -m py_compile apps/api/src/controller/ai_manager.py scripts/check-ai-manager-lazy.py`
      passed.
    - Local deploy protocol checks passed before commit:
      `pnpm check:api-dockerfile`, `pnpm check:github-actions:deploy`,
      `pnpm check:api:deploy-schema`, `pnpm format:check`, and
      `git diff --check`.
    - GitHub Actions run `27865528022` on commit `f1d30925` succeeded.
      `Build API image on Lighthouse` completed in about 22 seconds and
      `Deploy changed services on Lighthouse` completed in about 19 seconds.
    - Public API GET health check returned `{"status":"ok"}`.
    - Public frontend checks for `https://sunworld.site` and
      `https://www.sunworld.site` returned HTTP 200.
    - Server verification showed `sun-world-api` running from image
      `sun-world-api:f1d3092504b37c59930e0ebde6cea11fa48e9b6d`, `my-frontend`
      still running, and `blog-api.service` `inactive` / `disabled`.
  - Next step:
    - Keep monitoring the persistent container. AI endpoints still need a real
      OpenRouter/OpenAI-compatible provider key before they can answer AI
      requests; missing keys no longer block API startup or health checks.

- Latest local feature checkpoint (2026-06-23, icon gallery cleanup):
  - Goal: remove pre-refactor ordinary UI icon Vue components and add a
    Lucide-style local preview for `@sun-world/icons`.
  - Status: merged locally to `main` at commit `84985a96`.
  - Important files touched:
    - `packages/icons/src/App.vue`
    - `packages/icons/src/App.spec.ts`
    - `packages/icons/src/index.spec.ts`
    - `packages/icons/src/icons/index.ts`
    - `docs/handoff/branches/codex-icon-gallery.md`
  - Verification:
    - `pnpm check:icons` passed.
    - `pnpm test:icons` passed.
    - `pnpm build:icons` passed.
    - `pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `pnpm format:check` passed.
    - `git diff --check` passed.

- Latest local feature checkpoint (2026-06-24, public SSG prerender):
  - Goal: improve public loading and SEO by generating static homepage,
    article, and sitemap output during the frontend build without changing the
    Nginx static deployment model.
  - Status: implemented locally and verified.
  - Important files touched:
    - `apps/web/package.json`
    - `apps/web/src/modules/blog/index.ts`
    - `apps/web/src/modules/blog/pages/BlogDetailPage.vue`
    - `apps/web/src/modules/blog/composables/useBlogReader.ts`
    - `apps/web/src/modules/blog/ui/BlogCard.vue`
    - `scripts/web-ssg-utils.mjs`
    - `scripts/prerender-public-pages.mjs`
    - `scripts/check-web-ssg.mjs`
    - `scripts/check-web.mjs`
    - `docs/superpowers/specs/2026-06-23-public-ssg-design.md`
    - `docs/superpowers/plans/2026-06-23-public-ssg.md`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - `pnpm -C apps/web build` runs `vite build` and then the public SSG
      prerender script.
    - Public article routes use canonical `/blog/<id>` URLs; legacy
      `/blog?id=<id>` remains supported.
    - Build-time article API failures warn but do not fail the frontend build.
  - Verification:
    - `node scripts/check-web-ssg.mjs` passed.
    - `pnpm -C apps/web exec vue-tsc --noEmit` passed.
    - `pnpm -C apps/web build` passed and generated 30 article pages from the
      public API.
    - `pnpm check:web` passed after formatting and regenerated the SSG article
      pages, build manifest, and build summary.
    - `pnpm format:check` passed.
    - `git diff --check` passed.
    - Manual dist spot check confirmed article canonical tags,
      BlogPosting JSON-LD, static article HTML, and sitemap article URLs.
  - Next step:
    - Commit `bc871052` was pushed to `main` and built successfully on
      Lighthouse, but the first deploy run `28065899403` failed during the
      immediate public frontend `curl` probe with a transient HTTP 502 after
      recreating `my-frontend`.
    - Follow-up local fix changes SSG output from directory `index.html` files
      to extensionless `.html` files, updates frontend Nginx to resolve
      `$uri.html`, and retries public frontend probes in the deploy workflow.
      Commit and push this fix before considering the publish fully green.

## Archives

- docs/handoff/archive/2026-06-20-platform-checkpoints.md contains the prior
  platform/deployment checkpoint history, including
  P1.70 compose frontend/API staging and the older P1.x handoff entries.

## Update Rules

- Update this file only with the current active branch links, the newest stable
  checkpoint, and archive pointers.
- Update docs/handoff/branches/<branch-slug>.md for active branch work that
  may diverge from main.
- Archive completed or stale branch notes before merging when they are no
  longer needed as active handoff context.
- Never store secrets, full tokens, passwords, private keys, certificates, or
  full environment values in any handoff file.
