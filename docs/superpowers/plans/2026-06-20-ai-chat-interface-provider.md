# AI Chat Interface And Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the AI page to a GPT-like chat surface and make DeepSeek/OpenAI-compatible provider config available through the shared backend API path used by the CLI.

**Architecture:** Backend provider config is server-only and lazy. Frontend UI and `sun-ai` CLI both call FastAPI `/ai/*` routes; the browser never executes CLI commands or stores provider tokens.

**Tech Stack:** FastAPI/Python config, Vue 3 module page, TypeScript API helpers, Node repository checks.

---

### Task 1: Provider Config Guard

**Files:**
- Modify: `apps/api/src/llm/config.py`
- Modify: `scripts/check-llm-config-env.py`

- [ ] **Step 1: Add failing provider checks**

Extend `scripts/check-llm-config-env.py` so it asserts `DEEPSEEK_API_KEY`,
`DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `AI_CHAT_MODEL`, and
`OPENAI_API_KEY` fallback names exist in the backend config source without
printing secret values.

- [ ] **Step 2: Run red check**

Run: `python scripts/check-llm-config-env.py`
Expected: FAIL because DeepSeek env names are not supported yet.

- [ ] **Step 3: Implement provider config**

Update `apps/api/src/llm/config.py` to expose provider constants while keeping
existing names compatible for model modules.

- [ ] **Step 4: Run green check**

Run: `python scripts/check-llm-config-env.py`
Expected: PASS.

### Task 2: AI Interface Guard

**Files:**
- Create: `scripts/check-ai-interface.mjs`
- Modify: `package.json`
- Modify: `scripts/check-web.mjs`

- [ ] **Step 1: Add failing frontend check**

Create a static check that requires the AI page to include a GPT-like shell,
use module AI API calls, reject token/password input fields, and expose
streaming send behavior.

- [ ] **Step 2: Run red check**

Run: `node scripts/check-ai-interface.mjs`
Expected: FAIL on the current legacy page.

- [ ] **Step 3: Implement UI**

Refactor `apps/web/src/modules/ai/pages/AigcPage.vue` and supporting module
types/API to provide the new full working chat surface.

- [ ] **Step 4: Run green check**

Run: `node scripts/check-ai-interface.mjs`
Expected: PASS.

### Task 3: Verification And Handoff

**Files:**
- Modify: `docs/handoff/branches/codex-ai-cli-skills.md`
- Modify: `scripts/check-platform-goal-audit.mjs`

- [ ] **Step 1: Add platform evidence**

Require the AI provider/interface checks and docs in the platform audit.

- [ ] **Step 2: Run checks**

Run:

```bash
python scripts/check-llm-config-env.py
node scripts/check-ai-interface.mjs
pnpm check:api
pnpm check:web
pnpm format:check
git diff --check
```

- [ ] **Step 3: Commit**

Commit on the non-main branch after verification.
