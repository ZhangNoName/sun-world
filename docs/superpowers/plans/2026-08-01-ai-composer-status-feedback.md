# AI Composer Status Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact, unified composer feedback surface and expose unavailable, ready, and generating/cancel primary-action states.

**Architecture:** Keep state derivation and event routing in `AiComposer`, isolate notice markup in a package-private `ComposerNotice`, and style both through package-scoped modifier classes. Reuse the existing `submit()`, `cancel()`, `onCancel`, `loading`, and `submitting` contracts without changing public types or payloads.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS, Vite, `@sun-world/icons`.

## Global Constraints

- The primary action has exactly three states: disabled send, enabled send, and enabled generating/stop.
- `submitting || loading` takes precedence over all send-validity conditions and renders `停止生成`.
- Clicking `停止生成` calls the existing `cancel()` path and never submits the form.
- Submission, file, and speech feedback share one package-private notice component.
- Submission errors clear on Markdown editing, a new submit attempt, reset, and successful submit.
- Attachments/model changes do not clear a submission error.
- No changes to `AiComposerProps`, `AiComposerHandle`, `AiComposerSubmitPayload`, or `AiComposerSubmitOverrides`.
- No new icon dependency or locally drawn SVG; reuse `SunIcon` names `send` and `square`.

---

### Task 1: Shared composer notice surface

**Files:**
- Create: `packages/ai-composer/src/feedback/ComposerNotice.tsx`
- Create: `packages/ai-composer/src/feedback/ComposerNotice.test.tsx`
- Modify: `packages/ai-composer/src/styles/ai-composer.css`

**Interfaces:**
- Produces: `ComposerNotice({ tone, role, children }: ComposerNoticeProps)`.
- Produces: `ComposerNoticeTone = 'neutral' | 'warning' | 'error'`.
- Consumed by: `AiComposer` in Task 2.

- [ ] **Step 1: Add failing semantic and modifier tests**

Create `ComposerNotice.test.tsx` with literal behavior assertions:

```tsx
import { render, screen } from '@testing-library/react'

import { ComposerNotice } from './ComposerNotice'

describe('ComposerNotice', () => {
  it('renders an error alert with the error tone', () => {
    render(
      <ComposerNotice tone="error" role="alert">
        发送失败
      </ComposerNotice>
    )

    expect(screen.getByRole('alert')).toHaveTextContent('发送失败')
    expect(screen.getByRole('alert')).toHaveClass(
      'sw-ai-composer__notice',
      'sw-ai-composer__notice--error'
    )
  })

  it('renders warning status feedback', () => {
    render(
      <ComposerNotice tone="warning" role="status">
        文件未添加
      </ComposerNotice>
    )

    expect(screen.getByRole('status')).toHaveClass(
      'sw-ai-composer__notice--warning'
    )
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
corepack pnpm -F @sun-world/ai-composer exec vitest run src/feedback/ComposerNotice.test.tsx
```

Expected: FAIL because `ComposerNotice.tsx` does not exist.

- [ ] **Step 3: Implement the focused notice component**

Create the component with no composer state or timers:

```tsx
import type { ReactNode } from 'react'

export type ComposerNoticeTone = 'neutral' | 'warning' | 'error'

interface ComposerNoticeProps {
  children: ReactNode
  role: 'alert' | 'status'
  tone?: ComposerNoticeTone
}

export function ComposerNotice({
  children,
  role,
  tone = 'neutral',
}: ComposerNoticeProps) {
  return (
    <div
      className={`sw-ai-composer__notice sw-ai-composer__notice--${tone}`}
      role={role}
    >
      {children}
    </div>
  )
}
```

- [ ] **Step 4: Add package-scoped notice styles**

Replace the current plain notice rule with a compact content-width surface:

```css
.sw-ai-composer__feedback {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 2px 0 8px;
  max-width: 100%;
}

.sw-ai-composer__notice {
  align-self: flex-start;
  border-radius: 9px;
  color: var(--composer-secondary);
  font-size: 12px;
  line-height: 1.45;
  max-width: 100%;
  padding: 6px 9px;
  white-space: normal;
}

.sw-ai-composer__notice--neutral {
  background: var(--composer-muted);
}

.sw-ai-composer__notice--warning {
  background: color-mix(in srgb, #f59e0b 10%, transparent);
  color: color-mix(in srgb, #92400e 82%, var(--composer-text));
}

.sw-ai-composer__notice--error {
  background: color-mix(in srgb, #ef4444 9%, transparent);
  color: color-mix(in srgb, #991b1b 82%, var(--composer-text));
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run:

```bash
corepack pnpm -F @sun-world/ai-composer exec vitest run src/feedback/ComposerNotice.test.tsx
corepack pnpm -F @sun-world/ai-composer build
git add packages/ai-composer/src/feedback/ComposerNotice.tsx packages/ai-composer/src/feedback/ComposerNotice.test.tsx packages/ai-composer/src/styles/ai-composer.css
git commit -m "feat(ai-composer): add feedback surface"
```

Expected: two notice tests pass and the package builds.

### Task 2: Three-state primary action and error lifetime

**Files:**
- Modify: `packages/ai-composer/src/AiComposer.tsx`
- Modify: `packages/ai-composer/src/AiComposer.test.tsx`
- Modify: `packages/ai-composer/src/styles/ai-composer.css`

**Interfaces:**
- Consumes: `ComposerNotice` from Task 1.
- Preserves: `submit(overrides?) => Promise<boolean>` and `cancel() => void`.
- Derives internally: `primaryActionState: 'disabled' | 'ready' | 'generating'`.

- [ ] **Step 1: Add failing generating/cancel integration tests**

Add one test for pending submission and extend the harness to accept `loading`:

```tsx
it('replaces send with an enabled stop action while submission is pending', async () => {
  const user = userEvent.setup()
  const onCancel = vi.fn()
  let resolveSubmit: (() => void) | undefined
  const onSubmit = vi.fn(
    () => new Promise<void>((resolve) => (resolveSubmit = resolve))
  )
  render(<ComposerHarness onSubmit={onSubmit} onCancel={onCancel} />)

  await user.type(screen.getByRole('textbox'), 'generate')
  await user.click(screen.getByRole('button', { name: '发送消息' }))

  const stop = screen.getByRole('button', { name: '停止生成' })
  expect(stop).toBeEnabled()
  expect(screen.queryByRole('button', { name: '发送消息' })).not.toBeInTheDocument()

  await user.click(stop)
  expect(onCancel).toHaveBeenCalledTimes(1)
  expect(onSubmit).toHaveBeenCalledTimes(1)

  await act(async () => resolveSubmit?.())
})
```

Add a host-loading assertion:

```tsx
it('shows the stop action for host-controlled generation', () => {
  render(<ComposerHarness loading onCancel={vi.fn()} />)
  expect(screen.getByRole('button', { name: '停止生成' })).toBeEnabled()
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
corepack pnpm -F @sun-world/ai-composer exec vitest run src/AiComposer.test.tsx -t "stop action"
```

Expected: FAIL because pending submission still renders a disabled send button and the harness does not forward `loading`.

- [ ] **Step 3: Derive and render the three action states**

In `AiComposer`, derive the state with generating precedence:

```ts
const sendReady =
  value.trim().length > 0 &&
  Boolean(selectedModel && !selectedModel.disabled) &&
  !disabled
const primaryActionState =
  submitting || loading ? 'generating' : sendReady ? 'ready' : 'disabled'
const canSubmit = primaryActionState === 'ready'
```

Render generating independently from the send button:

```tsx
{primaryActionState === 'generating' ? (
  <button
    type="button"
    className="sw-ai-composer__primary-action sw-ai-composer__primary-action--generating"
    aria-label="停止生成"
    onClick={cancel}
  >
    <SunIcon name="square" size="xs" />
  </button>
) : (
  <button
    type="submit"
    className={`sw-ai-composer__primary-action sw-ai-composer__primary-action--${primaryActionState}`}
    aria-label="发送消息"
    disabled={primaryActionState === 'disabled'}
  >
    <SunIcon name="send" size="sm" />
  </button>
)}
```

Keep `submit()` guards unchanged so imperative calls remain safe.

- [ ] **Step 4: Verify GREEN for action states**

Run the same focused tests, then the existing duplicate-submission test.

Expected: both stop tests pass, cancel does not create a second submission, and duplicate submission remains prevented.

- [ ] **Step 5: Add failing submission-error lifetime test**

```tsx
it('clears a submission error when the draft changes', async () => {
  const user = userEvent.setup()
  render(<ComposerHarness onSubmit={() => Promise.reject(new Error('fail'))} />)
  const textbox = screen.getByRole('textbox')

  await user.type(textbox, 'first draft')
  await user.click(screen.getByRole('button', { name: '发送消息' }))
  expect(screen.getByRole('alert')).toHaveClass('sw-ai-composer__notice--error')

  await user.type(textbox, ' updated')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
```

- [ ] **Step 6: Verify RED**

Run:

```bash
corepack pnpm -F @sun-world/ai-composer exec vitest run src/AiComposer.test.tsx -t "clears a submission error"
```

Expected: FAIL because editing currently preserves `submissionError` and the error lacks the shared modifier.

- [ ] **Step 7: Integrate shared notices and clear errors on editing**

Import `ComposerNotice`, clear `submissionError` in the textarea `onChange`, and group lower feedback immediately above `.sw-ai-composer__toolbar`:

```tsx
{hasFeedback ? (
  <div className="sw-ai-composer__feedback">
    {rejectedFiles ? (
      <ComposerNotice tone="warning" role="status">
        {rejectedFiles} 个文件未添加
      </ComposerNotice>
    ) : null}
    {speechNotice ? (
      <ComposerNotice tone="warning" role="status">
        {speechNotice}
      </ComposerNotice>
    ) : null}
    {speech.status === 'error' ? (
      <ComposerNotice tone="error" role="alert">
        语音识别失败，请重试。
      </ComposerNotice>
    ) : null}
    {submissionError ? (
      <ComposerNotice tone="error" role="alert">
        {submissionError}
      </ComposerNotice>
    ) : null}
  </div>
) : null}
```

Use a local `speechNotice` string to avoid duplicating permission copy and a
local `hasFeedback` boolean to avoid rendering an empty wrapper. Preserve the
existing wording and roles.

- [ ] **Step 8: Add three-state button styles**

Replace attribute-specific primary-action selectors with modifier classes:

```css
.sw-ai-composer__primary-action {
  border-radius: 999px;
  height: 40px;
  margin-left: 4px;
  width: 40px;
}

.sw-ai-composer__primary-action--ready,
.sw-ai-composer__primary-action--generating {
  background: var(--composer-strong);
  color: var(--composer-surface);
  opacity: 1;
}

.sw-ai-composer__primary-action--disabled {
  background: color-mix(in srgb, var(--composer-strong) 42%, transparent);
  color: var(--composer-surface);
}
```

Keep the existing generic disabled cursor rule; the explicit disabled modifier
owns the muted surface.

- [ ] **Step 9: Verify the package and commit**

Run:

```bash
corepack pnpm -F @sun-world/ai-composer test
corepack pnpm -F @sun-world/ai-composer build
git diff --check
git add packages/ai-composer/src/AiComposer.tsx packages/ai-composer/src/AiComposer.test.tsx packages/ai-composer/src/styles/ai-composer.css
git commit -m "feat(ai-composer): add primary action states"
```

Expected: all composer tests pass and the package builds.

### Task 3: Live design QA and repository verification

**Files:**
- Modify: `design-qa.md`
- Modify: `docs/agent-handoff.md`

**Interfaces:**
- Verifies the unchanged public composer API through existing tests and live `/aigc` integration.
- Produces no runtime interface.

- [ ] **Step 1: Verify all three live action states**

At `http://127.0.0.1:4173/aigc` in the in-app browser:

- empty input: `发送消息` exists and is disabled with the muted modifier;
- valid text: `发送消息` is enabled with the ready modifier;
- pending/host loading: `停止生成` is enabled, displays the square icon, and calls cancel;
- the toolbar does not move horizontally between states.

- [ ] **Step 2: Verify the feedback surface**

Trigger the existing unsupported-attachment submission path and confirm:

- the message is inside the composer above the toolbar;
- computed font size is 12px and it has the error tone modifier;
- long copy wraps without covering any tool;
- editing the Markdown clears it;
- document `scrollWidth === clientWidth`.

Compare the same desktop viewport against the supplied problem screenshot and
record the measured results in `design-qa.md`. Fix P0/P1/P2 differences before
continuing.

- [ ] **Step 3: Update durable handoff**

Add the goal, final status, important files, commands, verification result,
blockers, and next optional step to `docs/agent-handoff.md`. Do not include
secrets or environment values.

- [ ] **Step 4: Run final repository verification**

```bash
corepack pnpm check
git diff --check
git status --short
```

Expected: repository gate passes 19/19 and only the QA/handoff files are
uncommitted.

- [ ] **Step 5: Commit documentation**

```bash
git add design-qa.md docs/agent-handoff.md
git commit -m "docs: verify AI composer status feedback"
git status --short
```

Expected: the worktree is clean. Do not push or deploy unless explicitly
requested.
