## Current Handoff

This file is the short active handoff entrypoint. Keep it concise so branch
merges stay easy. Put branch-specific work in docs/handoff/branches/ and move
older completed checkpoints to docs/handoff/archive/.

## Current Local Work

- 2026-07-26: `fix/react-source-inspector` replaces the React-19-incompatible
  click-to-component integration with development-only Alt + left-click source
  navigation. Details and verification are in
  `docs/handoff/branches/fix-react-source-inspector.md`.

- 2026-07-26: `feat/figma-editor-foundation` implements the framework-neutral
  Figma-like editor foundation described in
  `docs/handoff/branches/feat-figma-editor-foundation.md`. Editor tests (41),
  build, focused Web editor tests (5), Web typecheck, formatting, whitespace,
  and comprehensive `/canvas` browser QA passed. Browser QA also produced and
  fixed regressions for property-field commit and transform-to-panel syncing.
  The complete `check:web` gate is still red only for four unrelated
  `BlogHomeFeed.test.tsx` expectations for a missing `阅读更多: 图搜索入门` link;
  59 other Web tests passed. Layer-tree reordering is also not implemented, so
  the corresponding Task 7 browser case remains open. Not pushed or deployed.

- 2026-07-22: homepage blog toolbar is now a compact three-action surface:
  the fixed search icon expands a left-side input with a 240ms eased transition
  and auto-focus, sort cycles newest → most viewed → oldest and applies
  immediately, and layout toggles list / waterfall on desktop. A reusable
  `arrow-up-down` UI icon and shared input ref forwarding were added. Focused
  interaction/style tests, icon boundary/tests/build, UI tests, and `check:web`
  passed. No commit, deployment, or changes to user-owned page files were made.

- 2026-07-22: button cursor feedback adds `cursor-pointer` through the shared
  `Button` primitive and a focused variant-contract assertion. The focused test
  and complete UI suite passed (47 tests); changed task files pass Prettier and
  `git diff --check`. The project-wide changed-file formatting script remains
  red only for the user's existing `apps/web/src/components/Avator/avator.tsx`
  and `apps/web/src/modules/home/pages/home-react.css` edits. No deployment or
  commit was performed.

- 2026-07-20: `feat/base-ui-home-polish` makes formerly Radix-backed primitives
  use Base UI 1.6 or appropriate semantic native elements while preserving
  package subpaths, canonical compound exports, project-used callbacks, and
  deprecated `Sun*` adapters. Both component manifests use the `@base-ui`
  registry, the lockfile contains no Radix packages, and the native-shadcn
  guard now requires Base UI and rejects Radix source/manifest entries across
  all supported JavaScript module extensions. The migration's shared Base UI
  internals produce a measured 177.8 KiB gzip entry, recorded under a focused
  180 KiB ceiling; total JS/CSS and
  every route budget remain under their existing limits. Homepage search/sort
  fields hide only their visual labels while
  retaining accessible Chinese names; metric grids, article actions, toolbar
  alignment, responsive ownership, and both design families were polished and
  browser-checked at 1440x900 and 390x844 with no horizontal overflow. The live
  weather payload was unavailable during QA, so its structure and theme were
  checked without content validation. Base UI's public Menu API has no popup
  `initialFocus` parity, and opaque custom Select item wrappers need explicit
  `Root.items` metadata for initial labels. `SelectContent forceMount` is an
  accepted inline/non-portalled compatibility path with no application
  consumer. Mounted compound compatibility content retains per-content
  document capture listeners because open-only attachment is unsafe without
  uniform Base UI open state and cancellation-parity coverage. Fresh
  verification passed the migration guard, 44 UI tests, 56 Web tests plus the
  full Web pipeline, the root build, formatting, and whitespace checks; the
  final Radix scan found no source/manifest matches. The known API Extractor
  TypeScript-version warning remains non-blocking. Not pushed or deployed.

- 2026-07-20: `feat/web-ui-library-enforcement` fixes the incomplete shadcn
  style pipeline by loading the public UI stylesheet and scanning UI package
  source classes. All Web interactive controls now come from `@sun-world/ui`;
  reusable Web-local controls moved into package patterns, and a new guard
  prevents raw interactive JSX from returning. `check:web` passed through all
  tests, typecheck, build, SSG and package guards; the final CSS budget is 36.2
  / 38 KiB. Browser QA confirmed computed shadcn button styling and Sun World
  to Apple one-click switching. Not pushed or deployed.

- 2026-07-20: `feat/native-shadcn-ui` replaces the earlier shadcn-inspired
  implementation with the real shadcn `new-york` source model, Tailwind CSS v4,
  canonical Radix composition, canonical app imports, and standard semantic
  theme variables for both Sun World and Apple. `Sun*` exports are deprecated
  compatibility adapters. `corepack pnpm -C packages/ui test` passed 12/12,
  the UI package build passed, and `corepack pnpm check:web` passed 47/47 app
  tests, TypeScript, production build, 30-article SSG, package guards, and all
  performance budgets. Browser QA confirmed the homepage renders in Apple dark
  and switches to Sun World dark with one click. Not pushed or deployed.

- 2026-07-19: blog list and article reading surfaces were visually rebuilt on
  local `main` after the switchable-theme rollout. The feed now uses the shared
  Radix select, a composed search toolbar, segmented view controls, and refined
  article cards. Article detail has a centered reading surface, sticky styled
  catalog, responsive layout, and complete Markdown typography for code,
  quotes, tables, links, and media. Shared application chrome CSS now loads from
  the layout itself, so direct article routes no longer depend on homepage CSS.
  `corepack pnpm check:web` passed (47 React tests, TypeScript, production build,
  SSG, budgets, and chunk checks). Browser QA passed for desktop Sun World,
  Apple light, and 390x844 mobile layouts. Not pushed or deployed.
- 2026-07-19: local `main` migrates all `@sun-world/ui` primitives
  and composed patterns to project-owned shadcn-style directories while keeping
  public subpaths and `Sun*` APIs compatible. Component source, CSS, and indexes
  are colocated; canonical aliases and `buttonVariants` support local
  composition. `corepack pnpm -C packages/ui test` passed with 12 tests,
  package ESM/CJS/declaration builds passed, and `corepack pnpm check:web`
  passed with 47 application tests, production build, SSG, budgets, and chunk
  checks. Not pushed or deployed.

- 2026-07-19: switchable Sun World and Apple design families are implemented
  on `feat/switchable-design-themes`. The theme controller supports
  `light`/`dark`/`system`, migrates legacy preferences, persists and syncs
  selections, and exposes a one-click family switch plus lazy precise options.
  Global chrome, shared UI controls, and homepage surfaces consume the new
  semantic materials, typography, motion, and accessibility fallbacks.
  `corepack pnpm check:web` passed, including 47 React tests, TypeScript, SSG
  production build, the new theme contract, performance budgets, and chunk
  checks. Browser QA passed for Apple light/dark, desktop one-click and precise
  selection, mobile layout/drawer access, and the ICP filing. The entry bundle
  is 160.2 KiB gzip against the intentionally updated 162 KiB budget; detailed
  options are a 0.48 KiB lazy chunk. Not deployed.

- 2026-07-18: the React guidelines remediation and review documentation were
  pushed and deployed from `main` at `036a680f`. GitHub Actions run
  `29594687950` completed successfully, including frontend checks, the
  Lighthouse frontend image build, and production deployment. Public `/`,
  `/home`, and `/aigc` routes returned HTTP 200; the rendered homepage showed
  the required ICP filing link; and the API health endpoint returned
  `{"status":"ok"}`. All six P2 findings are resolved; the three P3 review
  items remain follow-up debt.
- 2026-07-17: the full React 19 + shadcn/Radix frontend rebuild has been merged
  into `main`. Historical implementation evidence remains in
  `docs/handoff/branches/refactor-react-shadcn.md`.

## Active Branches

- feat/figma-editor-foundation: see
  docs/handoff/branches/feat-figma-editor-foundation.md.

- refactor/react-shadcn: see
  docs/handoff/branches/refactor-react-shadcn.md.
- feat/aigc-ui-polish: see
  docs/handoff/branches/feat-aigc-ui-polish.md.
- codex/ai-cli-skills: see
  docs/handoff/branches/codex-ai-cli-skills.md.
- codex/server-side-web-build: see
  docs/handoff/branches/codex-server-side-web-build.md.
- codex/md-editor-v3-migration: see
  docs/handoff/branches/codex-md-editor-v3-migration.md.
- feat/admin-log-module: see
  docs/handoff/branches/feat-admin-log-module.md.

## Latest Stable Checkpoint

- Current task addendum (2026-07-01, md-editor-v3 / AI entry / back-to-top deploy):
  - Goal: deploy the markdown editor migration, public AI entry, and blog feed
    back-to-top control from `main`.
  - Status: committed, pushed, deployed, and verified.
  - Commits:
    - `8a9cb602` `feat(web): migrate markdown editing to md-editor-v3`
    - `1ac572fc` `feat(web): expose ai entry and add feed back to top`
  - Deployment:
    - Pushed `main` to `origin/main` at `1ac572fc`.
    - GitHub Actions run `28527558861` completed successfully.
    - `Build frontend image on Lighthouse`, `Build API image on Lighthouse`,
      and `Deploy changed services on Lighthouse` all succeeded.
  - Verification:
    - Local pre-push `corepack pnpm check:web` passed.
    - Local pre-push `corepack pnpm format:check` passed.
    - Local pre-push `git diff --check` passed with only LF/CRLF warnings.
    - Public `curl -fsSI https://sunworld.site` returned HTTP 200.
    - Public `curl -fsSI https://www.sunworld.site` returned HTTP 200.
    - Public `curl -fsSI https://sunworld.site/aigc` returned HTTP 200.
    - Public `curl -fsS https://api.sunworld.site/healthz` returned
      `{"status":"ok"}`.

- Completed task addendum (2026-07-01, blog feed back-to-top):
  - Goal: add a one-click back-to-top control while scrolling the blog list.
  - Status: deployed on `main` at `1ac572fc`.
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

- Completed task addendum (2026-07-01, AI public entry):
  - Goal: expose the AI chat interface entry while keeping `/aigc` as the
    existing full-screen AI workspace.
  - Status: deployed on `main` at `1ac572fc`.
  - Important files touched:
    - `apps/web/src/layout/header/index.vue`
    - `apps/web/src/layout/mobLayout.vue`
    - `apps/web/src/modules/ai/index.ts`
    - `scripts/check-ai-public-entry-visible.mjs`
    - `scripts/check-web.mjs`
    - `docs/current-state.md`
    - `docs/agent-handoff.md`
  - Behavior:
    - Desktop header shows a `message-circle` icon that navigates to `/aigc`.
    - Mobile bottom navigation and drawer expose `/aigc`.
    - AI module nav registration exposes
      `{ label: 'AI', path: '/aigc', icon: 'message-circle' }`.
    - The old hidden-entry guard was replaced with
      `scripts/check-ai-public-entry-visible.mjs`.

- Completed task checkpoint (2026-07-01, md-editor-v3 migration):
  - Goal: replace Vditor runtime editor/preview usage in blog authoring and
    public article detail with md-editor-v3.
  - Status: deployed on `main` at `1ac572fc`.
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
