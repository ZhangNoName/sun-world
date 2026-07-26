# Figma-Like Editor Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `@sun-world/editor` into a leak-free, command-driven Canvas editor foundation with Figma-style selection, transforms, history, and document-scoped persistence.

**Architecture:** Keep `SWEditor` as the public facade while extracting persistent scene state into `EditorDocument`, transient interaction state into `SelectionModel`, reversible mutations into `CommandManager`, and browser storage behind `DocumentRepository`. A single pointer/keyboard controller feeds tool state machines; document, selection, and viewport invalidations drive a Canvas renderer, while the React hook remains a thin adapter.

**Tech Stack:** TypeScript, Canvas 2D, Pointer Events, React 19, Vitest 2, jsdom, Vite 5, pnpm 10.15.1.

## Global Constraints

- Preserve the `/canvas` route and the existing `SWEditor` methods consumed by `useEditorCanvas` during migration.
- Keep `@sun-world/editor` framework-neutral; do not add React or another rendering framework to the package.
- Use `corepack pnpm` so the repository-declared pnpm 10.15.1 is selected.
- Every production behavior must be preceded by a failing focused test.
- Do not implement collaboration, vector paths, Auto Layout, components/instances, or server version history in this phase.
- Do not create subagents; execute every task inline in the current conversation.

---

### Task 1: Editor Test Harness and Deterministic Lifecycle

**Files:**
- Modify: `packages/editor/package.json`
- Create: `packages/editor/vitest.config.ts`
- Create: `packages/editor/src/test/setup.ts`
- Create: `packages/editor/src/event/inputController.test.ts`
- Create: `packages/editor/src/event/inputController.ts`
- Modify: `packages/editor/src/editor.ts`
- Modify: `packages/editor/src/types/tools.type.ts`
- Modify: `packages/editor/src/public-api.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `InputController` with `modifiers`, `bind()`, and idempotent `dispose()`.
- Produces: root command `test:editor` and package command `vitest run`.
- Preserves: `new SWEditor({ containerElement })` and `SWEditor.destroy()`.

- [ ] **Step 1: Add the editor Vitest harness and a failing disposal test**

```ts
it('removes every registered listener and disposes only once', () => {
  const target = new EventTarget()
  const controller = new InputController({ canvas: target, keyboardTarget: target })
  const received: string[] = []
  controller.bind((event) => received.push(event.type))
  target.dispatchEvent(new Event('pointerdown'))
  controller.dispose()
  controller.dispose()
  target.dispatchEvent(new Event('pointerdown'))
  expect(received).toEqual(['pointerdown'])
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `corepack pnpm -C packages/editor test -- src/event/inputController.test.ts`

Expected: FAIL because `InputController` does not exist.

- [ ] **Step 3: Implement one Pointer Events input owner**

Implement `InputController` so it registers pointer, wheel, context-menu, keydown,
and keyup listeners through stored handler references, tracks modifier/button
state, ignores editor shortcuts originating in editable controls, and removes all
listeners from an idempotent `dispose()`.

- [ ] **Step 4: Replace duplicate input ownership in `SWEditor`**

Remove both legacy `InputManager` instances from editor composition, route active
tool events and shortcuts through `InputController`, and make `SWEditor.destroy()`
dispose input, subscriptions, cursor resources, and renderer exactly once.

- [ ] **Step 5: Run lifecycle tests and editor build**

Run: `corepack pnpm -C packages/editor test -- src/event/inputController.test.ts`

Run: `corepack pnpm build:editor`

Expected: PASS with no leaked-listener or declaration errors.

- [ ] **Step 6: Commit the lifecycle slice**

```bash
git add package.json pnpm-lock.yaml packages/editor
git commit -m "refactor(editor): unify input lifecycle"
```

### Task 2: Persistent Document and Transient Selection Models

**Files:**
- Create: `packages/editor/src/document/editorDocument.ts`
- Create: `packages/editor/src/document/editorDocument.test.ts`
- Create: `packages/editor/src/selection/selectionModel.ts`
- Create: `packages/editor/src/selection/selectionModel.test.ts`
- Modify: `packages/editor/src/elements/elementManager.ts`
- Modify: `packages/editor/src/elements/ele.type.ts`
- Modify: `packages/editor/src/public-api.ts`

**Interfaces:**
- Produces: `EditorDocumentSnapshotV1`, `EditorDocument`, and typed document results.
- Produces: `SelectionModel` with `replace`, `toggle`, `add`, `clear`, `removeSubtree`, and combined bounds.
- Consumes: existing `BaseElement`, `GroupElement`, and matrix utilities.

- [ ] **Step 1: Write failing document-invariant tests**

Cover unique IDs, required parents, cycle rejection, stable sibling order,
all-or-nothing import, subtree removal/restoration, and snapshot round trips.

- [ ] **Step 2: Verify document tests fail for missing model**

Run: `corepack pnpm -C packages/editor test -- src/document/editorDocument.test.ts`

Expected: FAIL because `EditorDocument` is not defined.

- [ ] **Step 3: Implement `EditorDocument` and compatibility delegation**

Move scene storage, hierarchy mutation, and serialization behind
`EditorDocument`. Keep `ElementManager` temporarily delegating rendering and
legacy public calls so `/canvas` remains functional.

- [ ] **Step 4: Write failing selection semantics tests**

Cover replace, Ctrl/Meta toggle, Shift add, clear, locked/invisible exclusion,
subtree cleanup, deterministic order, and aggregate bounds.

- [ ] **Step 5: Verify selection tests fail, then implement `SelectionModel`**

Run: `corepack pnpm -C packages/editor test -- src/selection/selectionModel.test.ts`

Expected before implementation: FAIL because `SelectionModel` is missing.

Expected after implementation: PASS.

- [ ] **Step 6: Run the complete editor tests and build**

Run: `corepack pnpm -C packages/editor test`

Run: `corepack pnpm build:editor`

- [ ] **Step 7: Commit document and selection models**

```bash
git add packages/editor/src
git commit -m "refactor(editor): separate document and selection models"
```

### Task 3: Command History and Reversible Mutations

**Files:**
- Create: `packages/editor/src/history/command.ts`
- Create: `packages/editor/src/history/commandManager.ts`
- Create: `packages/editor/src/history/commandManager.test.ts`
- Create: `packages/editor/src/history/documentCommands.ts`
- Create: `packages/editor/src/history/documentCommands.test.ts`
- Modify: `packages/editor/src/editor.ts`
- Modify: `packages/editor/src/tools/reactTools.ts`
- Modify: `packages/editor/src/tools/select/drag.ts`
- Modify: `packages/editor/src/elements/elementManager.ts`
- Modify: `packages/editor/src/public-api.ts`

**Interfaces:**
- Produces: `EditorCommand`, `CommandManager.execute`, `undo`, `redo`, `canUndo`, `canRedo`, and `onChange`.
- Produces: add, delete-subtree, update-attributes, transform, and reparent commands.
- Consumes: `EditorDocument` snapshots and mutation results from Task 2.

- [ ] **Step 1: Write failing history-stack tests**

Cover execute, undo, redo, redo invalidation after a new command, failed-command
exclusion, listener notification, and idempotent disposal.

- [ ] **Step 2: Verify RED and implement the minimal `CommandManager`**

Run: `corepack pnpm -C packages/editor test -- src/history/commandManager.test.ts`

Expected before implementation: FAIL due to the missing manager.

- [ ] **Step 3: Write failing reversible document-command tests**

Demonstrate that add, subtree delete, property update, transform, and reparent
restore exact IDs, parent order, geometry, and selection-relevant data.

- [ ] **Step 4: Implement document commands and migrate facade mutations**

Route `updateElement`, `deleteSelectedElement`, creation, drag completion, and
tree movement through commands. Expose `undo`, `redo`, `canUndo`, `canRedo`, and
history subscriptions on `SWEditor`.

- [ ] **Step 5: Add keyboard shortcuts through `InputController`**

Implement platform-aware Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y, Delete,
Backspace, and Ctrl/Cmd+S while preserving normal behavior in editable fields.

- [ ] **Step 6: Run editor tests and build**

Run: `corepack pnpm -C packages/editor test`

Run: `corepack pnpm build:editor`

- [ ] **Step 7: Commit history support**

```bash
git add packages/editor/src
git commit -m "feat(editor): add reversible command history"
```

### Task 4: Figma-Style Selection and Transform Gestures

**Files:**
- Create: `packages/editor/src/controlHandle/handleGeometry.ts`
- Create: `packages/editor/src/controlHandle/handleGeometry.test.ts`
- Create: `packages/editor/src/tools/select/selectTool.test.ts`
- Modify: `packages/editor/src/controlHandle/controlManager.ts`
- Modify: `packages/editor/src/tools/select/index.ts`
- Modify: `packages/editor/src/tools/select/area.ts`
- Modify: `packages/editor/src/tools/select/drag.ts`
- Modify: `packages/editor/src/tools/select/resize.ts`
- Modify: `packages/editor/src/tools/select/rotate.ts`
- Modify: `packages/editor/src/render/render.ts`
- Modify: `packages/editor/src/viewport/viewport.ts`

**Interfaces:**
- Produces: shared transform-handle geometry used by both rendering and hit testing.
- Produces: select states `idle`, `marquee`, `move`, `resize`, and `rotate`.
- Consumes: `SelectionModel` and `CommandManager` from prior tasks.

- [ ] **Step 1: Write failing handle geometry tests**

Cover eight resize handles, the rotation handle, screen-consistent sizes across
zoom levels, nearest-hit priority, and no hit outside tolerance.

- [ ] **Step 2: Verify RED and implement shared handle geometry**

Run: `corepack pnpm -C packages/editor test -- src/controlHandle/handleGeometry.test.ts`

- [ ] **Step 3: Write failing select state-machine tests**

Cover click selection, Shift additive selection, Ctrl/Meta toggle, marquee,
move, resize, rotate, Escape cancellation, pointer-up commit, and pointer capture.

- [ ] **Step 4: Implement the select interaction state machine**

Use one gesture snapshot and emit one command on pointer-up. Escape restores the
snapshot without adding history. Locked elements remain immutable and
unselectable from Canvas interactions.

- [ ] **Step 5: Render selection overlays from the same geometry**

Replace disconnected control drawing/hit-test logic with the shared handle
geometry and ensure handle sizes stay visually constant while zooming.

- [ ] **Step 6: Run editor tests and build**

Run: `corepack pnpm -C packages/editor test`

Run: `corepack pnpm build:editor`

- [ ] **Step 7: Commit selection and transforms**

```bash
git add packages/editor/src
git commit -m "feat(editor): add figma-style selection transforms"
```

### Task 5: Document-Scoped Persistence

**Files:**
- Create: `packages/editor/src/persistence/documentRepository.ts`
- Create: `packages/editor/src/persistence/localStorageDocumentRepository.ts`
- Create: `packages/editor/src/persistence/localStorageDocumentRepository.test.ts`
- Create: `packages/editor/src/persistence/memoryDocumentRepository.ts`
- Modify: `packages/editor/src/editor.ts`
- Modify: `packages/editor/src/elements/elementManager.ts`
- Modify: `packages/editor/src/public-api.ts`

**Interfaces:**
- Produces: `DocumentRepository.load(documentId)` and `save(documentId, snapshot)`.
- Produces: browser local-storage and in-memory repository implementations.
- Adds: `documentId` and optional `repository` to `IEditorOptions`.

- [ ] **Step 1: Write failing repository isolation and migration tests**

Cover two document IDs, versioned keys, invalid JSON, invalid snapshots,
repository errors, and one-time migration of valid legacy `editor-data`.

- [ ] **Step 2: Verify RED and implement repositories**

Run: `corepack pnpm -C packages/editor test -- src/persistence/localStorageDocumentRepository.test.ts`

- [ ] **Step 3: Inject persistence into `SWEditor`**

Remove direct local-storage access from `ElementManager`; load and save via the
configured repository without clearing in-memory state on repository failure.

- [ ] **Step 4: Run editor tests and build**

Run: `corepack pnpm -C packages/editor test`

Run: `corepack pnpm build:editor`

- [ ] **Step 5: Commit persistence isolation**

```bash
git add packages/editor/src
git commit -m "refactor(editor): isolate document persistence"
```

### Task 6: React Workspace Integration

**Files:**
- Modify: `apps/web/src/modules/editor/hooks/useEditorCanvas.ts`
- Modify: `apps/web/src/modules/editor/hooks/useEditorCanvas.test.tsx`
- Modify: `apps/web/src/modules/editor/pages/EditorCanvasPage.tsx`
- Modify: `apps/web/src/modules/editor/ui/EditorCanvasTree.tsx`
- Modify: `apps/web/src/modules/editor/ui/EditorCanvasLeft.tsx`
- Modify: `apps/web/src/modules/editor/ui/EditorCanvasRight.tsx`
- Modify: `apps/web/src/modules/editor/pages/editor-canvas.css`
- Modify: `packages/editor/package.json`

**Interfaces:**
- Consumes: history, selection, document loading, and command APIs from Tasks 1-5.
- Produces: React state for `canUndo`, `canRedo`, multi-selection, save status, and command-backed property edits.

- [ ] **Step 1: Extend the fake adapter and write failing hook tests**

Assert history state subscriptions, undo/redo forwarding, multi-selection state,
save status, and complete cleanup.

- [ ] **Step 2: Verify RED and update `useEditorCanvas`**

Run: `corepack pnpm -C apps/web test:react -- src/modules/editor/hooks/useEditorCanvas.test.tsx`

- [ ] **Step 3: Add accessible workspace controls**

Add undo/redo buttons with disabled state and shortcuts in their accessible
labels, multi-selection property feedback, modifier-aware layer selection, and
real tool labels. Hide the placeholder comment tool until implemented.

- [ ] **Step 4: Protect package CSS from tree shaking**

Change editor package `sideEffects` to include `src/**/*.css` and `dist/*.css`.

- [ ] **Step 5: Run focused Web tests and type checking**

Run: `corepack pnpm -C apps/web test:react -- src/modules/editor/hooks/useEditorCanvas.test.tsx`

Run: `corepack pnpm -C apps/web typecheck`

- [ ] **Step 6: Commit React integration**

```bash
git add apps/web/src/modules/editor packages/editor/package.json
git commit -m "feat(web): expose editor history and selection controls"
```

### Task 7: Full Verification and Durable Handoff

**Files:**
- Modify: `packages/editor/README.md`
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`

**Interfaces:**
- Consumes: all completed editor foundation behavior.
- Produces: accurate package documentation and durable verification evidence.

- [ ] **Step 1: Replace the template editor README**

Document package purpose, architecture, public API, input/selection behavior,
repository injection, development commands, and current non-goals.

- [ ] **Step 2: Run complete automated verification**

Run: `corepack pnpm -C packages/editor test`

Run: `corepack pnpm build:editor`

Run: `corepack pnpm -C apps/web test:react`

Run: `corepack pnpm check:web`

Run: `corepack pnpm format:check`

Run: `git diff --check`

Expected: every command passes; known unrelated warnings must be recorded rather
than represented as editor failures.

- [ ] **Step 3: Perform browser verification on `/canvas`**

Verify rectangle creation; click, additive, toggle, and marquee selection; move,
resize, and rotate; undo and redo; layer selection/reordering; property updates;
save/reload; editable-field shortcut safety; and route leave/re-entry without
duplicate events or console errors.

- [ ] **Step 4: Update durable project state**

Record the goal, files touched, commands, results, browser observations, remaining
non-goals, blockers, and next recommended Figma capability in `docs/current-state.md`
and `docs/agent-handoff.md`.

- [ ] **Step 5: Commit documentation and verification evidence**

```bash
git add packages/editor/README.md docs/current-state.md docs/agent-handoff.md
git commit -m "docs(editor): record figma foundation verification"
```

