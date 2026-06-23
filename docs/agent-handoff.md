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
- codex/icon-gallery: see
  docs/handoff/branches/codex-icon-gallery.md.

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
