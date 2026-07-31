# ChatGPT Work Composer Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the reusable AI composer match the supplied ChatGPT Work-mode reference by removing inline preview UI and preventing input focus from changing the composer outline.

**Architecture:** Keep `AiComposer` as a controlled source-text editor and preserve every submission, attachment, command, model, speech, cancellation, and imperative API. Remove only the package-local preview branch and its unused renderer/dependencies, then verify the visual result in the existing `/aigc` host.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite, CSS, in-app browser QA.

## Global Constraints

- The supplied 1192×186 screenshot is the visual source of truth.
- Focusing or typing must not change composer border, shadow, background, or outline.
- Keyboard-only `:focus-visible` treatment remains on actionable toolbar controls.
- Empty input keeps send disabled without a visible validation message.
- Existing attachment, command, model, speech, loading/cancel, submission, and ref APIs remain unchanged.

---

### Task 1: Remove Inline Preview And Lock Focus Behavior

**Files:**
- Modify: `packages/ai-composer/src/AiComposer.test.tsx`
- Modify: `packages/ai-composer/src/AiComposer.tsx`
- Modify: `packages/ai-composer/src/styles/ai-composer.css`
- Delete: `packages/ai-composer/src/markdown/MarkdownPreview.tsx`
- Delete: `packages/ai-composer/src/markdown/MarkdownPreview.test.tsx`
- Modify: `packages/ai-composer/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: existing `AiComposerProps`, `AiComposerHandle`, and `AiComposerSubmitPayload`.
- Produces: the same public interfaces with a textarea-only Markdown source editing surface.

- [ ] **Step 1: Replace the preview-toggle test with a failing source-only regression test**

```tsx
it('keeps Markdown as source text without an inline preview control', async () => {
  const user = userEvent.setup()
  render(<ControlledComposer />)
  const textbox = screen.getByRole('textbox', { name: '消息' })

  await user.type(textbox, '# 标题')

  expect(textbox).toHaveValue('# 标题')
  expect(
    screen.queryByRole('button', { name: '预览 Markdown' })
  ).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Markdown 预览')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the regression test and verify RED**

Run: `corepack pnpm -C packages/ai-composer test -- AiComposer.test.tsx`

Expected: FAIL because the existing `预览 Markdown` button is still rendered.

- [ ] **Step 3: Remove preview state, render branch, styles, renderer, and direct Markdown dependencies**

Remove `previewing`, `MarkdownPreview`, the mode-switch markup, `.sw-ai-composer__mode-switch`, `.sw-ai-composer__markdown`, `react-markdown`, `remark-gfm`, and `rehype-sanitize` from the composer package. Keep the textarea `outline: none` rule and do not add any `.sw-ai-composer:focus-within` visual change.

- [ ] **Step 4: Run composer tests and build**

Run: `corepack pnpm -C packages/ai-composer test && corepack pnpm -C packages/ai-composer build`

Expected: all composer tests pass and the library build succeeds.

- [ ] **Step 5: Commit the behavior correction**

```bash
git add packages/ai-composer pnpm-lock.yaml
git commit -m "fix(ai-composer): match ChatGPT source-only input"
```

### Task 2: Documentation, Integration Verification, And Visual QA

**Files:**
- Modify: `packages/ai-composer/README.md`
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`
- Create: `design-qa.md`

**Interfaces:**
- Consumes: the source-only `AiComposer` from Task 1.
- Produces: durable usage guidance and a same-state screenshot comparison result.

- [ ] **Step 1: Update documentation**

Replace live-preview claims with source-only Markdown editing and host-rendered messages. Record that text focus does not alter the composer surface.

- [ ] **Step 2: Run integration verification**

Run:

```bash
corepack pnpm -C packages/ai-ui test
corepack pnpm -C packages/ai-ui build
corepack pnpm -C apps/web typecheck
corepack pnpm check:ai-interface
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Capture and compare `/aigc`**

Start the Web dev server at `http://127.0.0.1:4173/aigc`, focus/type in the textarea, capture the desktop composer at the same interaction state as the reference, and measure computed border, outline, shadow, dimensions, and overflow before and after focus.

- [ ] **Step 4: Write the blocking QA report**

Create `design-qa.md` with the reference path, local capture path, measured comparison, remaining P3 notes, and exactly `final result: passed` only when no P0–P2 mismatch remains.

- [ ] **Step 5: Run final verification and commit**

Run:

```bash
corepack pnpm format
corepack pnpm check
git status --short
```

Expected: full root gate passes and only the intended documentation/QA files remain before commit.

```bash
git add packages/ai-composer/README.md docs/current-state.md docs/agent-handoff.md design-qa.md
git commit -m "docs(ai-composer): record ChatGPT visual parity"
```
