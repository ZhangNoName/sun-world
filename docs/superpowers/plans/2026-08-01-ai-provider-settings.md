# AI Provider Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make provider-profile saves visibly complete and use shared shadcn-style form controls.

**Architecture:** `AiProviderSettings` awaits its optional save callback and manages only presentation state for that operation. The existing page-level callback remains responsible for persistence and profile-list data. The dialog composes UI package field and select primitives instead of browser-native controls.

**Tech Stack:** React 19, Vitest, Testing Library, Base UI-backed shadcn components from `@sun-world/ui`.

## Global Constraints

- Preserve the API key's browser-only lifecycle: clear it when the dialog opens and after a successful save.
- Do not expose API-key contents in profiles, status text, or tests.
- Do not add dependencies.

---

### Task 1: Verify save completion in the provider settings dialog

**Files:**
- Modify: `packages/ai-ui/src/AiWorkspace.test.tsx`
- Modify: `packages/ai-ui/src/AiProviderSettings.tsx`

**Interfaces:**
- Consumes: `onSave?: (draft: AiProviderDraft) => void | Promise<void>`.
- Produces: a dialog that awaits `onSave` and calls `onOpenChange(false)` after a fulfilled save.

- [ ] **Step 1: Write the failing test**

```tsx
const onSaveProvider = vi.fn().mockResolvedValue(undefined)
render(<AiWorkspace {...requiredProps} onSaveProvider={onSaveProvider} />)
await user.click(screen.getByRole('button', { name: '模型设置' }))
await user.click(screen.getByRole('button', { name: '保存配置' }))
await waitFor(() => expect(onSaveProvider).toHaveBeenCalledTimes(1))
expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `corepack pnpm -C packages/ai-ui exec vitest run src/AiWorkspace.test.tsx`

Expected: FAIL because the existing submit handler does not await the callback or close the dialog.

- [ ] **Step 3: Write minimal implementation**

```tsx
const [saveError, setSaveError] = useState<string | null>(null)
const [isSaving, setIsSaving] = useState(false)

const submit = async (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault()
  setIsSaving(true)
  setSaveError(null)
  try {
    await onSave?.(draft)
    setApiKey('')
    onOpenChange(false)
  } catch (error) {
    setSaveError(error instanceof Error ? error.message : '保存失败，请重试。')
  } finally {
    setIsSaving(false)
  }
}
```

Use `Field`, `FieldGroup`, `FieldLabel`, and the composed `Select` primitives for every control. Disable cancellation and submit while saving, and render `FieldError` with `role=alert` for failed saves.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `corepack pnpm -C packages/ai-ui exec vitest run src/AiWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run package verification**

Run: `corepack pnpm test:ai-ui && corepack pnpm build:ai-ui && corepack pnpm format:check && git diff --check`

Expected: all commands exit 0.

### Task 2: Compact composer model options

**Files:**
- Modify: `packages/ai-ui/src/AiWorkspace.test.tsx`
- Modify: `packages/ai-ui/src/AiWorkspace.tsx`

**Interfaces:**
- Consumes: model options with `label: string` and `description: string`.
- Produces: one visible option row containing the model label and provider tag.

- [ ] **Step 1: Write the failing test**

```tsx
await user.click(screen.getByRole('button', { name: /选择模型/ }))
const option = screen.getByRole('option', { name: 'deepseek-chat DeepSeek' })
expect(within(option).getByText('DeepSeek')).toHaveClass('sw-ai-model-provider-tag')
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `corepack pnpm -C packages/ai-ui exec vitest run src/AiWorkspace.test.tsx`

Expected: FAIL because the provider is rendered as a second description line, not as the model-option tag.

- [ ] **Step 3: Write minimal implementation**

Render the option as a single flex row: label first, then a `sw-ai-model-provider-tag` span containing the provider description. Apply compact spacing and truncate only the label when necessary.

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `corepack pnpm -C packages/ai-ui exec vitest run src/AiWorkspace.test.tsx`

Expected: PASS.

- [ ] **Step 5: Run package verification**

Run: `corepack pnpm test:ai-ui && corepack pnpm build:ai-ui && corepack pnpm format:check && git diff --check`

Expected: all commands exit 0.
