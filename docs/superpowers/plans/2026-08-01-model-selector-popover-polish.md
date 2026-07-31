# Model Selector Popover Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI composer model popover close on outside interaction and Escape while using a smaller ChatGPT-style visual scale.

**Architecture:** Keep behavior inside `ModelSelector`: a root ref defines the selector boundary and an effect installs document listeners only while open. Preserve the controlled model API and existing focus restoration. CSS changes remain package-scoped and use existing theme tokens.

**Tech Stack:** React 18, TypeScript, Vitest, Testing Library, CSS, Vite.

## Global Constraints

- Add no runtime dependency and change no public host API.
- Outside pointer dismissal must not steal focus from the clicked target.
- Escape dismissal and model selection must restore focus to the trigger.
- Popover minimum width is `220px`; option labels are `12px`; descriptions are `10px`; option padding is `7px 8px`.
- Preserve listbox/option semantics, disabled options, theme tokens, placement, radius, and shadow.

---

### Task 1: Dismissal behavior

**Files:**
- Modify: `packages/ai-composer/src/model-selector/ModelSelector.tsx`
- Test: `packages/ai-composer/src/AiComposer.test.tsx`

**Interfaces:**
- Consumes: existing `ModelSelectorProps` and controlled `onModelChange(modelId: string): void`.
- Produces: unchanged `ModelSelector` export with outside-pointer and Escape dismissal.

- [ ] **Step 1: Write the failing outside-pointer regression test**

```tsx
it('closes the model selector when the user clicks outside it', async () => {
  const user = userEvent.setup()
  render(<ComposerHarness />)
  await user.click(
    screen.getByRole('button', { name: '选择模型，当前 DeepSeek' })
  )
  expect(screen.getByRole('listbox', { name: '模型' })).toBeInTheDocument()
  await user.click(screen.getByRole('textbox', { name: '消息' }))
  expect(screen.queryByRole('listbox', { name: '模型' })).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test and verify RED**

```bash
corepack pnpm -F @sun-world/ai-composer test -- --run src/AiComposer.test.tsx
```

Expected: FAIL because the listbox remains after the outside click.

- [ ] **Step 3: Add the minimal outside-pointer implementation**

Import `useEffect`, create `rootRef = useRef<HTMLDivElement>(null)`, attach it
to the selector root, and add:

```tsx
useEffect(() => {
  if (!open) return
  const closeOutside = (event: PointerEvent) => {
    if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
  }
  document.addEventListener('pointerdown', closeOutside)
  return () => document.removeEventListener('pointerdown', closeOutside)
}, [open])
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same command. Expected: the new test and existing model tests pass.

- [ ] **Step 5: Write the failing Escape regression test**

```tsx
it('closes the model selector with Escape and restores trigger focus', async () => {
  const user = userEvent.setup()
  render(<ComposerHarness />)
  const trigger = screen.getByRole('button', {
    name: '选择模型，当前 DeepSeek',
  })
  await user.click(trigger)
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('listbox', { name: '模型' })).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
```

- [ ] **Step 6: Run the test and verify RED**

Run the focused command. Expected: FAIL because Escape leaves the listbox open.

- [ ] **Step 7: Add Escape handling to the open-state effect**

```tsx
const closeWithEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return
  setOpen(false)
  queueMicrotask(() => triggerRef.current?.focus())
}
document.addEventListener('keydown', closeWithEscape)
return () => {
  document.removeEventListener('pointerdown', closeOutside)
  document.removeEventListener('keydown', closeWithEscape)
}
```

- [ ] **Step 8: Run package tests and commit**

```bash
corepack pnpm -F @sun-world/ai-composer test
git add packages/ai-composer/src/model-selector/ModelSelector.tsx packages/ai-composer/src/AiComposer.test.tsx
git commit -m "fix(ai-composer): dismiss model popover"
```

Expected: all composer tests pass before the behavior commit.

### Task 2: Compact visual scale and live verification

**Files:**
- Modify: `packages/ai-composer/src/styles/ai-composer.css`
- Modify: `design-qa.md`
- Create: `docs/design-qa/ai-composer/model-selector-popover-final.png`

**Interfaces:**
- Consumes: existing `.sw-ai-composer__model-selector` class contract.
- Produces: compact themed popover with unchanged DOM semantics.

- [ ] **Step 1: Apply the confirmed CSS values**

```css
.sw-ai-composer__model-selector [role='listbox'] {
  min-width: 220px;
}

.sw-ai-composer__model-selector [role='option'] {
  font-size: 12px;
  padding: 7px 8px;
}

.sw-ai-composer__model-selector [role='option'] span {
  font-size: 10px;
}
```

- [ ] **Step 2: Run package tests and build**

```bash
corepack pnpm -F @sun-world/ai-composer test
corepack pnpm -F @sun-world/ai-composer build
```

Expected: both commands exit 0.

- [ ] **Step 3: Verify live interaction and geometry**

At `http://127.0.0.1:4173/aigc`, verify trigger toggle, inside interaction,
outside dismissal, Escape focus restoration, option selection, and computed
sizes (`220px`, `12px`, `10px`). Confirm no horizontal overflow or console
error. Capture the open state to
`docs/design-qa/ai-composer/model-selector-popover-final.png` and update
`design-qa.md` with measurements and the passing result.

- [ ] **Step 4: Run repository verification and commit**

```bash
corepack pnpm check
git diff --check
git add packages/ai-composer/src/styles/ai-composer.css design-qa.md docs/design-qa/ai-composer/model-selector-popover-final.png
git commit -m "style(ai-composer): compact model popover"
```

Expected: repository gate passes 19/19 and the worktree is clean after commit.
