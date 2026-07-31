# AI Composer Attachment Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a horizontally scrollable, type-aware attachment strip with image thumbnails, duplicate feedback, no file sizes, and a neutral `+` control.

**Architecture:** Extend the shared icon data, keep file validation and presentation mapping in pure attachment utilities, isolate image object URL ownership in a focused preview component, and let `AiComposer` coordinate only file state and the transient duplicate notice. Public props, imperative handles, and submit payloads remain unchanged.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, CSS, Vite, `@sun-world/icons`.

## Global Constraints

- Attachments render before the textarea in one non-wrapping horizontal row.
- Duplicate identity is `name + size + lastModified`; duplicate files are separate from other rejections.
- Duplicate notices remain visible for 2.5 seconds and a new duplicate resets the timer.
- Images render local thumbnails only; every object URL is revoked.
- Cards show filenames but never file sizes.
- Use only `SunIcon` and Lucide-style data in `packages/icons/src/data/ui.ts`; add no local SVG or icon dependency.
- Clicking/focusing the attachment `+` control adds no border, outline, shadow, or background highlight.
- No public composer API or submit payload change.

---

### Task 1: File-category icon data

**Files:**
- Modify: `packages/icons/src/data/ui.spec.ts`
- Modify: `packages/icons/src/data/ui.ts`

**Interfaces:**
- Produces icon names: `file-pdf`, `file-code`, `file-spreadsheet`, `file-archive`, `file-audio`, `file-video`.

- [ ] **Step 1: Add a failing icon-name test**

```ts
expect(uiIconNames).toEqual(
  expect.arrayContaining([
    'file-pdf',
    'file-code',
    'file-spreadsheet',
    'file-archive',
    'file-audio',
    'file-video',
  ])
)
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm test:icons
```

Expected: FAIL because the six names are absent.

- [ ] **Step 3: Add six Lucide-style icon definitions**

Add file-outline definitions with `viewBox: '0 0 24 24'`, the shared folded
corner paths from `file-text`, and category nodes using only supported node
types. Each definition's `name` must exactly match its object key.

- [ ] **Step 4: Verify and commit**

```bash
corepack pnpm check:icons
corepack pnpm test:icons
corepack pnpm build:icons
git add packages/icons/src/data/ui.ts packages/icons/src/data/ui.spec.ts
git commit -m "feat(icons): add attachment file categories"
```

### Task 2: Duplicate classification and presentation mapping

**Files:**
- Modify: `packages/ai-composer/src/attachments/files.ts`
- Modify: `packages/ai-composer/src/attachments/files.test.ts`
- Create: `packages/ai-composer/src/attachments/filePresentation.ts`
- Create: `packages/ai-composer/src/attachments/filePresentation.test.ts`

**Interfaces:**
- Produces `FileValidationResult { accepted: File[]; duplicates: File[]; rejectedCount: number }`.
- Produces `filePresentation(file: File): { kind: 'image' | 'file'; icon: UiIconName; category: AttachmentCategory }`.

- [ ] **Step 1: Split duplicate expectations from rejection expectations**

Update the existing validation test to expect the repeated existing file in
`result.duplicates`, and expect `rejectedCount` to count only oversize/excess/
accept failures.

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm -F @sun-world/ai-composer exec vitest run src/attachments/files.test.ts
```

Expected: FAIL because `duplicates` does not exist and the count still includes duplicates.

- [ ] **Step 3: Implement duplicate classification**

Initialize `duplicates: File[] = []`; when `keys.has(key)`, push to duplicates
and continue without incrementing `rejectedCount`. Return all three fields.

- [ ] **Step 4: Verify GREEN**

Run the same test. Expected: both file validation tests pass.

- [ ] **Step 5: Add table-driven presentation tests**

Use literal cases for PNG, PDF, CSV, ZIP, MP3, MP4, JSON, and DOCX. Assert the
expected category and icon; assert PNG returns `kind: 'image'`.

- [ ] **Step 6: Verify RED**

```bash
corepack pnpm -F @sun-world/ai-composer exec vitest run src/attachments/filePresentation.test.ts
```

Expected: FAIL because the module is missing.

- [ ] **Step 7: Implement MIME/extension mapping and commit**

Use lowercase MIME/name checks in the precedence order from the design spec and
return the exact icon names created in Task 1. Then run:

```bash
corepack pnpm -F @sun-world/ai-composer exec vitest run src/attachments
git add packages/ai-composer/src/attachments/files.ts packages/ai-composer/src/attachments/files.test.ts packages/ai-composer/src/attachments/filePresentation.ts packages/ai-composer/src/attachments/filePresentation.test.ts
git commit -m "feat(ai-composer): classify attachment files"
```

### Task 3: Attachment cards and image URL lifecycle

**Files:**
- Create: `packages/ai-composer/src/attachments/ImageAttachmentPreview.tsx`
- Create: `packages/ai-composer/src/attachments/AttachmentList.test.tsx`
- Modify: `packages/ai-composer/src/attachments/AttachmentList.tsx`

**Interfaces:**
- `ImageAttachmentPreview({ file }: { file: File })` creates one object URL and revokes it on cleanup.
- `AttachmentList` keeps `files` and `onRemove(index)` unchanged.

- [ ] **Step 1: Add failing card and lifecycle tests**

Stub `URL.createObjectURL` to return `blob:preview` and spy on
`URL.revokeObjectURL`. Render one PNG and one PDF, then assert:

```tsx
expect(screen.getByRole('img', { name: 'photo.png' })).toHaveAttribute(
  'src',
  'blob:preview'
)
expect(screen.getByTestId('attachment-icon-file-pdf')).toBeInTheDocument()
expect(screen.queryByText(/KB|MB| B$/)).not.toBeInTheDocument()
unmount()
expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
```

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm -F @sun-world/ai-composer exec vitest run src/attachments/AttachmentList.test.tsx
```

Expected: FAIL because image previews and category icons do not exist and file size is still rendered.

- [ ] **Step 3: Implement the image preview**

Use a `useEffect` keyed by `file` to create the object URL, store it in state,
and revoke the same URL from the cleanup. Render `<img src={url} alt={file.name} />` only when ready.

- [ ] **Step 4: Implement typed cards without size text**

Call `filePresentation(file)`. Render `ImageAttachmentPreview` for images;
otherwise render `SunIcon` with the returned icon and a category test id. Keep
the filename and remove button and delete `formatFileSize`.

- [ ] **Step 5: Verify and commit**

```bash
corepack pnpm -F @sun-world/ai-composer exec vitest run src/attachments/AttachmentList.test.tsx
git add packages/ai-composer/src/attachments/ImageAttachmentPreview.tsx packages/ai-composer/src/attachments/AttachmentList.tsx packages/ai-composer/src/attachments/AttachmentList.test.tsx
git commit -m "feat(ai-composer): render attachment previews"
```

### Task 4: Composer integration, scrolling, and duplicate notice

**Files:**
- Modify: `packages/ai-composer/src/AiComposer.tsx`
- Modify: `packages/ai-composer/src/AiComposer.test.tsx`
- Modify: `packages/ai-composer/src/styles/ai-composer.css`
- Modify: `design-qa.md`
- Create: `docs/design-qa/ai-composer/attachment-strip-final.png`

**Interfaces:**
- Consumes `validateIncomingFiles(...).duplicates` and the unchanged `AttachmentList` props.
- Keeps `AiComposerProps`, `AiComposerHandle`, and `AiComposerSubmitPayload` unchanged.

- [ ] **Step 1: Add failing duplicate-notice integration test**

Use fake timers, upload the same file twice, assert the filename appears once,
assert the duplicate status is visible, advance 2500ms, and assert the status is removed.

- [ ] **Step 2: Verify RED**

```bash
corepack pnpm -F @sun-world/ai-composer exec vitest run src/AiComposer.test.tsx -t "duplicate attachment"
```

Expected: FAIL because duplicates only contribute to a generic persistent rejection count.

- [ ] **Step 3: Implement the notice timer and reorder the strip**

Store duplicate filenames separately, replace/clear a 2500ms timeout in an
effect, render the duplicate notice immediately after `AttachmentList`, and
move `AttachmentList` before the textarea. Preserve the generic non-duplicate
rejection status.

- [ ] **Step 4: Add package-scoped layout and focus styles**

Set the list to `flex-wrap: nowrap`, `overflow-x: auto`, `overscroll-behavior-x:
contain`, and `scrollbar-width: thin`. Add image and file card modifiers, fixed
thumbnail/icon slots, ellipsis, and an absolute remove button. Add an attachment
modifier class to the `+` label and reset its `:focus-within` background,
border, box-shadow, and outline.

- [ ] **Step 5: Verify packages and live browser behavior**

```bash
corepack pnpm -F @sun-world/ai-composer test
corepack pnpm -F @sun-world/ai-composer build
corepack pnpm check:icons
corepack pnpm test:icons
corepack pnpm build:icons
```

In `/aigc`, upload mixed sample files, verify image thumbnail rendering, distinct
icons, one-row overflow (`scrollWidth > clientWidth` when filled), native
horizontal scrolling, no size text, duplicate notice timeout, removal, submit
payload preservation, and no `+` focus surface. Save the screenshot and update
`design-qa.md`.

- [ ] **Step 6: Run repository verification and commit**

```bash
corepack pnpm check
git diff --check
git add packages/ai-composer/src/AiComposer.tsx packages/ai-composer/src/AiComposer.test.tsx packages/ai-composer/src/styles/ai-composer.css design-qa.md docs/design-qa/ai-composer/attachment-strip-final.png
git commit -m "feat(ai-composer): add attachment strip"
```

Expected: repository gate passes 19/19 and the worktree is clean.
