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

## Latest Stable Checkpoint

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
    - Review and commit the local changes, then let the existing main deploy
      workflow build the frontend image when pushed.

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
