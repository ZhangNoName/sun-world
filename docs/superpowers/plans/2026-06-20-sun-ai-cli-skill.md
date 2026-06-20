# Sun AI CLI And Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify the first-phase Sun World AI CLI plus repository skill.

**Architecture:** The CLI is a Node HTTP adapter over the Python FastAPI AI routes. Contract and CLI behavior checks run in the existing API verification chain so Python route drift is caught.

**Tech Stack:** Node.js ESM scripts, `fetch`, `http` fake server tests, existing `packages/contracts/openapi.json`, repository `.agents/skills`.

---

### Task 1: Contract Sync Check

**Files:**
- Create: `scripts/check-sun-ai-contract-sync.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing check**

Create `scripts/check-sun-ai-contract-sync.mjs` that expects `tools/sun-ai-cli/src/capabilities.mjs` to exist and validates curated AI paths against `packages/contracts/openapi.json`.

- [ ] **Step 2: Run check to verify it fails**

Run: `node scripts/check-sun-ai-contract-sync.mjs`
Expected: FAIL because the capabilities module is missing.

- [ ] **Step 3: Add minimal capability metadata**

Create `tools/sun-ai-cli/src/capabilities.mjs` with `inspect`, `chat`, `stream`, `generate-image`, and `read-image` metadata.

- [ ] **Step 4: Run check to verify it passes**

Run: `node scripts/check-sun-ai-contract-sync.mjs`
Expected: PASS.

### Task 2: CLI Behavior Check And Implementation

**Files:**
- Create: `scripts/check-sun-ai-cli.mjs`
- Create: `tools/sun-ai-cli/src/cli.mjs`
- Create: `tools/sun-ai-cli/src/http-client.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing CLI check**

Create a fake local HTTP server in `scripts/check-sun-ai-cli.mjs`, run the CLI
commands against it, and assert request path/body and JSON output.

- [ ] **Step 2: Run check to verify it fails**

Run: `node scripts/check-sun-ai-cli.mjs`
Expected: FAIL because the CLI entrypoint is missing.

- [ ] **Step 3: Implement minimal CLI**

Add argument parsing, production URL guard, JSON output, streaming pass-through,
and request helpers.

- [ ] **Step 4: Run check to verify it passes**

Run: `node scripts/check-sun-ai-cli.mjs`
Expected: PASS.

### Task 3: Repository Skill

**Files:**
- Create: `.agents/skills/sun-world-ai/SKILL.md`
- Create: `.agents/skills/sun-world-ai/references/cli.md`

- [ ] **Step 1: Write the skill**

Create a concise skill that tells agents to use `pnpm sun-ai` for Sun World AI
model calls, to prefer local API URLs, and to avoid production unless explicitly
approved.

- [ ] **Step 2: Validate skill shape**

Run a local metadata check through `node scripts/check-sun-ai-cli.mjs` after the
script includes skill validation.

### Task 4: Verification Integration

**Files:**
- Modify: `scripts/run-api-check.mjs`
- Modify: `scripts/check-platform-goal-audit.mjs`
- Modify: `docs/handoff/branches/codex-ai-cli-skills.md`

- [ ] **Step 1: Add checks to API verification**

Add `scripts/check-sun-ai-contract-sync.mjs` and `scripts/check-sun-ai-cli.mjs`
to `scripts/run-api-check.mjs`.

- [ ] **Step 2: Add platform evidence**

Make `scripts/check-platform-goal-audit.mjs` require the CLI, skill, and check
files.

- [ ] **Step 3: Run final verification**

Run:

```bash
node scripts/check-sun-ai-contract-sync.mjs
node scripts/check-sun-ai-cli.mjs
pnpm check:api
pnpm format:check
git diff --check
```

Expected: all pass, with only known Windows CRLF warnings from `git diff --check`.
