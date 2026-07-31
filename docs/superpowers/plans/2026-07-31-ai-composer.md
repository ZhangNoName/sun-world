# AI Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone Codex-inspired `@sun-world/ai-composer` React package and replace the basic composer in the existing `/aigc` workspace.

**Architecture:** The new package owns presentation-only AI composition state and exposes controlled text/model props plus an imperative ref. Focused attachment, command, Markdown, model, and speech modules feed one submission path; `@sun-world/ai-ui` adapts provider profiles and delegates network cancellation to the existing Web controller.

**Tech Stack:** React 19, TypeScript, Vite library mode, Vitest, Testing Library, `@sun-world/ui`, `@sun-world/icons`, `react-markdown`, `remark-gfm`, `rehype-sanitize`.

## Global Constraints

- Use `corepack pnpm` with repository-declared pnpm `10.15.1` and Node `24.17.0`.
- Target desktop visual quality at approximately 1280px and 1440px; mobile receives overflow protection only.
- Do not upload before submit, request provider/model/command APIs from the package, or own the host AI request's `AbortController`.
- Invalid input silently disables send; speech and real submission failures remain visible.
- Preserve Markdown, files, and selected command after a rejected submission or cancellation.
- Use project-owned icons and semantic UI tokens; do not add arbitrary inline SVG.
- Follow strict red-green-refactor TDD for every behavior change.

---

### Task 1: Package Scaffold And Core Submission Contract

**Files:**
- Create: `packages/ai-composer/package.json`
- Create: `packages/ai-composer/tsconfig.json`
- Create: `packages/ai-composer/vite.config.ts`
- Create: `packages/ai-composer/src/test/setup.ts`
- Create: `packages/ai-composer/src/types.ts`
- Create: `packages/ai-composer/src/AiComposer.tsx`
- Create: `packages/ai-composer/src/AiComposer.test.tsx`
- Create: `packages/ai-composer/src/index.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `AiComposer`, `AiComposerHandle`, `AiComposerProps`, `AiComposerModel`, `AiComposerCommand`, `AiComposerSubmitPayload`, and `AiComposerSubmitOverrides` exactly as defined in the approved design.
- Consumes: React 19 peer APIs and workspace `@sun-world/ui` / `@sun-world/icons` exports.

- [ ] **Step 1: Add test-only package scaffolding and failing public behavior tests**

Create `package.json`, `tsconfig.json`, `vite.config.ts`, and
`src/test/setup.ts` so Vitest can execute without adding production component
code. Create `AiComposer.test.tsx` with a controlled harness and tests proving:

```tsx
it('submits trimmed markdown and clears only after success', async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined)
  render(<ComposerHarness onSubmit={onSubmit} />)
  await userEvent.type(screen.getByRole('textbox', { name: '消息' }), '  hello  ')
  await userEvent.click(screen.getByRole('button', { name: '发送消息' }))
  expect(onSubmit).toHaveBeenCalledWith({ markdown: 'hello', files: [], modelId: 'deepseek', commandId: undefined })
  expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue('')
})

it('keeps the draft when submission rejects', async () => {
  render(<ComposerHarness onSubmit={() => Promise.reject(new Error('offline'))} />)
  await userEvent.type(screen.getByRole('textbox', { name: '消息' }), 'keep me')
  await userEvent.click(screen.getByRole('button', { name: '发送消息' }))
  expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue('keep me')
  expect(screen.getByRole('alert')).toHaveTextContent('发送失败，请重试。')
})
```

Also cover empty/disabled/model-disabled send states, Shift+Enter, duplicate async submission prevention, `focus`, `setQuestion`, imperative override submission, `cancel`, and `reset`.

- [ ] **Step 2: Run the package test and verify RED**

Run: `corepack pnpm -C packages/ai-composer test`

Expected: FAIL because the `AiComposer` production export does not exist.

- [ ] **Step 3: Add the production package entry and implement the minimal core**

Use the existing `packages/ai-ui` Vite/Vitest setup as the template. Add root scripts:

```json
"build:ai-composer": "pnpm -F @sun-world/ai-composer run build",
"test:ai-composer": "pnpm -F @sun-world/ai-composer run test"
```

Implement a controlled textarea, send/stop buttons, the `forwardRef` handle, a shared asynchronous `submit()` path, silent sendability checks, safe generic submission errors, and success-only clearing.

- [ ] **Step 4: Install workspace metadata and verify GREEN**

Run: `corepack pnpm install --lockfile-only`

Run: `corepack pnpm -C packages/ai-composer test`

Expected: all Task 1 tests PASS.

- [ ] **Step 5: Build the package**

Run: `corepack pnpm -C packages/ai-composer build`

Expected: ESM bundle, CSS, and declarations are emitted without TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml packages/ai-composer
git commit -m "feat(ai-composer): add controlled submission core"
```

### Task 2: Attachments, Model Selector, And Structured Commands

**Files:**
- Create: `packages/ai-composer/src/attachments/AttachmentList.tsx`
- Create: `packages/ai-composer/src/attachments/files.ts`
- Create: `packages/ai-composer/src/attachments/files.test.ts`
- Create: `packages/ai-composer/src/commands/CommandPalette.tsx`
- Create: `packages/ai-composer/src/commands/commands.ts`
- Create: `packages/ai-composer/src/commands/commands.test.ts`
- Create: `packages/ai-composer/src/model-selector/ModelSelector.tsx`
- Modify: `packages/ai-composer/src/AiComposer.tsx`
- Modify: `packages/ai-composer/src/AiComposer.test.tsx`

**Interfaces:**
- Produces: `validateIncomingFiles(current, incoming, limits): { accepted: File[]; rejectedCount: number }` and `filterCommands(commands, query): AiComposerCommand[]`.
- Consumes: public model/command types and the Task 1 submission path.

- [ ] **Step 1: Write failing pure utility tests**

Use literal fixtures to verify file deduplication by name/size/lastModified, `accept`, count and byte-size limits, and command filtering by label/description/keywords while excluding disabled matches from selection.

- [ ] **Step 2: Run utilities and verify RED**

Run: `corepack pnpm -C packages/ai-composer test -- src/attachments/files.test.ts src/commands/commands.test.ts`

Expected: FAIL because the utilities are missing.

- [ ] **Step 3: Implement minimal file and command utilities**

Implement deterministic validation and case-insensitive filtering with no DOM dependencies.

- [ ] **Step 4: Verify utility tests GREEN**

Run the command from Step 2 and expect PASS.

- [ ] **Step 5: Add failing interaction tests**

Extend `AiComposer.test.tsx` to prove file selection/removal and original `File` submission, controlled model switching, `/` palette opening, filtering, Up/Down/Enter/Tab/Escape behavior, command replacement/removal, and separate `commandId` submission without slash syntax in Markdown.

- [ ] **Step 6: Run interaction tests and verify RED**

Run: `corepack pnpm -C packages/ai-composer test -- src/AiComposer.test.tsx`

Expected: FAIL because the attachment list, selector, and palette are not rendered.

- [ ] **Step 7: Implement focused UI modules and integrate them**

Use a visually hidden multiple file input, accessible attachment remove buttons, a controlled model listbox/dropdown, and an absolutely positioned command palette above the composer. Store only `File[]` and one `commandId` internally.

- [ ] **Step 8: Verify all package tests GREEN and commit**

Run: `corepack pnpm -C packages/ai-composer test`

```bash
git add packages/ai-composer/src
git commit -m "feat(ai-composer): add attachments models and commands"
```

### Task 3: Safe Markdown Preview And Modular Browser Speech

**Files:**
- Create: `packages/ai-composer/src/markdown/MarkdownPreview.tsx`
- Create: `packages/ai-composer/src/markdown/MarkdownPreview.test.tsx`
- Create: `packages/ai-composer/src/speech/types.ts`
- Create: `packages/ai-composer/src/speech/browserSpeechAdapter.ts`
- Create: `packages/ai-composer/src/speech/useSpeechInput.ts`
- Create: `packages/ai-composer/src/speech/useSpeechInput.test.tsx`
- Modify: `packages/ai-composer/src/types.ts`
- Modify: `packages/ai-composer/src/AiComposer.tsx`
- Modify: `packages/ai-composer/src/AiComposer.test.tsx`
- Modify: `packages/ai-composer/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `SpeechInputAdapter`, stable `SpeechInputState`, `createBrowserSpeechAdapter()`, and `useSpeechInput({ adapter, onFinalTranscript })`.
- Consumes: controlled Markdown updates and React Markdown safety dependencies.

- [ ] **Step 1: Write failing Markdown safety tests**

Prove GFM tables render, script/unsafe HTML is removed, and `javascript:` links are not emitted as navigable links.

- [ ] **Step 2: Run Markdown tests and verify RED**

Run: `corepack pnpm -C packages/ai-composer test -- src/markdown/MarkdownPreview.test.tsx`

Expected: FAIL because `MarkdownPreview` is missing.

- [ ] **Step 3: Implement the safe preview and verify GREEN**

Use `react-markdown`, `remark-gfm`, and `rehype-sanitize`. Add explicit safe-protocol handling consistent with `AiBlockRenderer`.

- [ ] **Step 4: Write failing speech lifecycle tests**

With a deterministic injected adapter, prove unsupported, checking, ready, listening, denied, and error states; interim display; final transcript append; and stop on second click, submit, cancel, reset, and unmount.

- [ ] **Step 5: Run speech tests and verify RED**

Run: `corepack pnpm -C packages/ai-composer test -- src/speech/useSpeechInput.test.tsx src/AiComposer.test.tsx`

Expected: FAIL because the adapter and Hook do not exist.

- [ ] **Step 6: Implement the adapter, Hook, and composer controls**

Keep vendor-prefixed speech globals inside `browserSpeechAdapter.ts`. Check `window.isSecureContext`, API availability, and `navigator.permissions.query({ name: 'microphone' })` when supported. Map errors to `permission-denied`, `not-supported`, `no-speech`, `device-unavailable`, or `recognition-failed`.

- [ ] **Step 7: Verify package tests/build and commit**

Run: `corepack pnpm -C packages/ai-composer test`

Run: `corepack pnpm -C packages/ai-composer build`

```bash
git add packages/ai-composer pnpm-lock.yaml
git commit -m "feat(ai-composer): add markdown preview and speech"
```

### Task 4: Codex-Inspired Desktop Styling

**Files:**
- Create: `packages/ai-composer/src/styles/ai-composer.css`
- Modify: `packages/ai-composer/src/AiComposer.tsx`
- Modify: `packages/ai-composer/src/attachments/AttachmentList.tsx`
- Modify: `packages/ai-composer/src/commands/CommandPalette.tsx`
- Modify: `packages/ai-composer/src/model-selector/ModelSelector.tsx`

**Interfaces:**
- Consumes: semantic Sun World CSS variables and the functional modules from Tasks 1-3.
- Produces: one package-owned desktop composer stylesheet loaded by the public component.

- [ ] **Step 1: Add accessibility-focused interaction assertions before styling**

Add tests for icon accessible names, active option semantics, status announcements, focus returning to triggers, and screen-reader-only disabled reasons.

- [ ] **Step 2: Run tests and verify RED where semantics are missing**

Run: `corepack pnpm -C packages/ai-composer test`

- [ ] **Step 3: Implement semantic markup fixes and desktop styles**

Build the two-level Codex card, auto-growing editor, attachment row, bottom toolbar, circular submit/stop control, command surface above the card, model popover, recording state, focus rings, reduced-motion behavior, dark tokens, and a minimal max-width media rule preventing catastrophic narrow-screen overflow.

- [ ] **Step 4: Verify tests/build and commit**

Run: `corepack pnpm -C packages/ai-composer test`

Run: `corepack pnpm -C packages/ai-composer build`

```bash
git add packages/ai-composer/src
git commit -m "style(ai-composer): match Codex desktop composer"
```

### Task 5: AI Workspace And Web Integration

**Files:**
- Modify: `packages/ai-ui/package.json`
- Modify: `packages/ai-ui/vite.config.ts`
- Modify: `packages/ai-ui/src/types.ts`
- Modify: `packages/ai-ui/src/AiWorkspace.tsx`
- Modify: `packages/ai-ui/src/AiWorkspace.test.tsx`
- Modify: `packages/ai-ui/src/ai-ui.css`
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/src/modules/ai/pages/AigcPage.tsx`
- Modify: `apps/web/src/modules/ai/composables/useAiChat.ts`
- Modify: `apps/web/src/modules/ai/composables/useAiChat.test.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- `AiWorkspaceProps.onSend` consumes `AiComposerSubmitPayload` and returns `void | Promise<void>`.
- `useAiChat.sendMessage` accepts the same payload for new user sends while edit/regenerate retain an internal text-only path.
- Model IDs use `profile:<profileId>` for saved profiles and `provider:<providerId>` for server defaults.

- [ ] **Step 1: Write failing AI workspace integration tests**

Update the existing controlled-send test to expect a structured payload. Add tests that saved provider profiles appear as model choices, stop delegates to `onStop`, and attachment/command submissions surface a safe unsupported-capability failure instead of calling the existing V1 text stream.

- [ ] **Step 2: Run AI UI tests and verify RED**

Run: `corepack pnpm -C packages/ai-ui test`

Expected: FAIL because `AiWorkspace` still uses `SunChatComposer` and string sends.

- [ ] **Step 3: Integrate the package into `AiWorkspace`**

Map profiles/providers to `AiComposerModel[]`, hold the controlled selected model, render the new Composer, pass run cancellation, and retain provider settings as the place where models/credentials are configured.

- [ ] **Step 4: Verify AI UI tests GREEN**

Run: `corepack pnpm -C packages/ai-ui test`

- [ ] **Step 5: Write failing Web controller tests**

Prove `profile:<id>` maps to `provider_profile_id`, provider defaults send `null`, plain Markdown still streams, and non-empty files or `commandId` reject before `streamAiRun` with the stable user-facing unsupported message.

- [ ] **Step 6: Run Web tests and verify RED**

Run: `corepack pnpm -C apps/web test:react -- src/modules/ai/composables/useAiChat.test.tsx src/modules/ai/pages/AigcPage.test.tsx`

- [ ] **Step 7: Implement the Web adapter and workspace aliases**

Add `@sun-world/ai-composer` workspace dependencies and Vite source aliases. Adapt `sendMessage` without changing the backend V1 contract. Keep edit, regenerate, and retry on the existing internal text submission helper.

- [ ] **Step 8: Verify package and Web integration and commit**

Run: `corepack pnpm -C packages/ai-ui test`

Run: `corepack pnpm -C packages/ai-ui build`

Run: `corepack pnpm -C apps/web test:react -- src/modules/ai`

Run: `corepack pnpm -C apps/web typecheck`

```bash
git add package.json pnpm-lock.yaml packages/ai-ui apps/web/package.json apps/web/vite.config.ts apps/web/src/modules/ai
git commit -m "feat(ai): integrate reusable composer"
```

### Task 6: Documentation, Full Verification, And Browser QA

**Files:**
- Create: `packages/ai-composer/README.md`
- Modify: `README.md`
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`

**Interfaces:**
- Documents: controlled usage, imperative ref usage, speech adapter injection, submission ownership, and the current unsupported backend attachment/command limitation.

- [ ] **Step 1: Document package consumption with exact examples**

Include a controlled component example and an imperative example using `ref.current?.submit({ markdown })` and `ref.current?.cancel()`.

- [ ] **Step 2: Run focused verification**

Run: `corepack pnpm test:ai-composer`

Run: `corepack pnpm build:ai-composer`

Run: `corepack pnpm test:ai-ui`

Run: `corepack pnpm build:ai-ui`

Run: `corepack pnpm -C apps/web test:react -- src/modules/ai`

Run: `corepack pnpm -C apps/web typecheck`

Run: `corepack pnpm format:check`

Run: `git diff --check`

Expected: every command exits zero with no new warnings.

- [ ] **Step 3: Run the relevant repository gate**

Run: `corepack pnpm check:web`

Expected: Web tests, typecheck, build, SSG, package guards, and budgets pass.

- [ ] **Step 4: Perform browser QA on local `/aigc`**

At 1280px and 1440px verify empty/long drafts, attachments, Markdown preview,
command opening/filtering/selection, model selection, speech support/denial,
loading/cancellation, failed submission preservation, and no catastrophic
overflow at a narrow mobile viewport. Capture screenshots for visual review.

- [ ] **Step 5: Update durable handoff and commit**

Record the goal, files, commands, results, limitations, and next mobile/backend
step in `docs/current-state.md` and `docs/agent-handoff.md`.

```bash
git add packages/ai-composer/README.md README.md docs/current-state.md docs/agent-handoff.md
git commit -m "docs: record AI composer integration"
```
