# React Development Guidelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a canonical, project-specific React development standard and review the current React codebase against it.

**Architecture:** Keep one normative document under `docs/`, link it from the repository-wide conventions and contributor entrypoint, and store the evidence-based review separately under `docs/reviews/`. Existing code is reviewed but not bulk-rewritten in this change.

**Tech Stack:** React 19, React Router 7, TypeScript 5, Vite 5, Vitest, Testing Library, Zustand, shadcn-style `@sun-world/ui`, Radix primitives, pnpm 10.15.1.

## Global Constraints

- New and modified React code follows the guideline immediately; legacy naming is migrated only when touched.
- Preserve the existing `app`, `modules`, `pages`, `shared`, and workspace package boundaries.
- Application pages consume `@sun-world/ui` and `@sun-world/icons/react`; they do not bypass the wrapper boundary without a documented exception.
- Do not enable new compiler flags, add lint dependencies, rename historical files, or change runtime behavior in this task.
- Review findings require current file-and-line evidence and a concrete violated rule.
- Use `corepack pnpm` so pnpm 10.15.1 and Node 24.17.0 remain authoritative.

---

### Task 1: Add the canonical React guideline

**Files:**
- Create: `docs/react-development-guidelines.md`

**Interfaces:**
- Consumes: `docs/engineering-conventions.md`, current `apps/web` structure, and official React/TypeScript rules.
- Produces: the canonical policy target linked by contributor and engineering documentation.

- [ ] **Step 1: Create the document with explicit enforcement language**

Start with this contract and keep the same meaning throughout the document:

```markdown
## How to read this document

- **MUST / MUST NOT**: required for new or modified code.
- **SHOULD / SHOULD NOT**: default; deviations need a reason in review.
- **MAY**: optional technique.
- Existing code is not grandfathered into permanent inconsistency: improve it
  when the relevant file is changed, but do not perform unrelated bulk rewrites.
```

Include exact sections for architecture, naming, files, imports, components,
state, every commonly used Hook, `useEffect`, memoization, TypeScript, API and
server state, styling/UI, accessibility, errors, performance, security,
testing, CI, review, examples, and Definition of Done.

- [ ] **Step 2: Encode project-specific boundaries**

Include these exact import policies:

```ts
import { SunButton } from '@sun-world/ui/button';
import { SunIcon } from '@sun-world/icons/react';
import { ROUTES } from '@sun-world/contracts/routes';
```

State that route modules own lazy imports, SSG-safe render code cannot depend
on browser globals during render, ICP filing behavior is protected, and chunk
and performance-budget checks are release gates.

- [ ] **Step 3: Verify the guideline structure**

Run:

```powershell
rg -n "^## " docs/react-development-guidelines.md
rg -n "MUST|useEffect|@sun-world/ui|Definition of Done" docs/react-development-guidelines.md
```

Expected: all required topics occur and the project boundaries are explicit.

### Task 2: Add contributor entrypoints without duplicating policy

**Files:**
- Create: `CONTRIBUTING.md`
- Modify: `docs/engineering-conventions.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: `docs/react-development-guidelines.md`.
- Produces: discoverable links from both contributor and repository documentation.

- [ ] **Step 1: Create the contributor workflow**

Use a concise workflow containing these commands:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm format:check
corepack pnpm check:web
corepack pnpm check
```

The document must point to `AGENTS.md`, `docs/engineering-conventions.md`, and
`docs/react-development-guidelines.md`, and must repeat the no-secrets and
no-force-push safety boundaries.

- [ ] **Step 2: Link the React guideline from engineering conventions**

Add a short `React And TypeScript` section that declares the new document
canonical for React code and states that repository-wide rules still win for
Git, deployment, secrets, and handoff.

- [ ] **Step 3: Link contributor documentation from README**

Add `CONTRIBUTING.md` and `docs/react-development-guidelines.md` to the existing
documentation list without rewriting unrelated README content.

- [ ] **Step 4: Check all relative link targets**

Run PowerShell `Test-Path` assertions for every new link target. Expected: all
assertions return true.

### Task 3: Review the current React codebase

**Files:**
- Create: `docs/reviews/2026-07-17-react-guidelines-review.md`

**Interfaces:**
- Consumes: the canonical guideline and current sources in `apps/web`,
  `packages/ui`, `packages/icons`, and `packages/editor`.
- Produces: a findings-first review with priorities, evidence, and follow-ups.

- [ ] **Step 1: Gather mechanical evidence**

Run targeted searches for Hook usage and suppression, browser globals during
render, unstable list keys, direct Radix/shadcn bypasses, unsafe casts,
`any`, vague filenames, files above 500/800 lines, missing accessible labels,
and component tests. Exclude generated output and dependencies.

- [ ] **Step 2: Inspect every candidate in context**

Read the complete component or Hook around each match. Reject false positives;
do not report a finding from a search result alone.

- [ ] **Step 3: Write the review report**

For every retained finding use this exact shape:

```markdown
### [P2] Short finding title

- Evidence: `path/to/file.tsx:42`
- Rule: the exact guideline section and requirement.
- Impact: a concrete failure or maintenance risk.
- Recommendation: the smallest scoped remediation.
```

Also list positive conformance, tooling gaps, reviewed scope, commands, and a
prioritized remediation sequence. If no P1/P2 finding is supported, say so
explicitly instead of inventing one.

- [ ] **Step 4: Recheck line numbers**

Run `rg -n` or line-numbered file reads immediately before completion.
Expected: every cited line exists and still contains the described evidence.

### Task 4: Validate and commit the documentation change

**Files:**
- Verify all files from Tasks 1-3.

**Interfaces:**
- Consumes: completed guideline, links, and review.
- Produces: one reviewable documentation commit after the already committed design.

- [ ] **Step 1: Scan for incomplete language**

Run:

```powershell
rg -n "T[B]D|T[O]DO|implement l[a]ter|fill in d[e]tails" docs/react-development-guidelines.md CONTRIBUTING.md docs/reviews/2026-07-17-react-guidelines-review.md
```

Expected: no matches.

- [ ] **Step 2: Run repository-safe checks**

Run:

```bash
git diff --check
corepack pnpm format:check
```

Expected: both commands exit 0. Markdown is outside the first Prettier baseline,
so the focused heading/link assertions remain authoritative for Markdown.

- [ ] **Step 3: Inspect final scope**

Run `git status --short` and `git diff --stat`. Expected: only the guideline,
contributor entrypoints, review report, engineering link, README links, and this
plan are changed.

- [ ] **Step 4: Commit**

```bash
git add CONTRIBUTING.md README.md docs/engineering-conventions.md \
  docs/react-development-guidelines.md \
  docs/reviews/2026-07-17-react-guidelines-review.md \
  docs/superpowers/plans/2026-07-17-react-development-guidelines.md
git commit -m "docs: add React development standards and review"
```
