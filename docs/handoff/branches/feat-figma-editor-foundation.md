# Figma Editor Foundation Handoff

## Current Goal

Evolve `@sun-world/editor` into a framework-neutral, Figma-like Canvas editor
foundation using the approved design and implementation plan:

- `docs/superpowers/specs/2026-07-26-figma-editor-foundation-design.md`
- `docs/superpowers/plans/2026-07-26-figma-editor-foundation.md`

All implementation is being performed inline in the current Codex conversation;
the user explicitly requested that no subagents be created.

## Status

- Branch: `feat/figma-editor-foundation`
- Worktree: `.worktrees/feat-figma-editor-foundation`
- Task 1 is complete and committed at `03aa0321`.
- Task 2 is complete. `ElementManager` now delegates scene storage/hierarchy to
  `EditorDocument` and selected IDs/bounds to `SelectionModel` while preserving
  the compatibility API consumed by tools, rendering, and React.
- Task 3 is complete. Command history now covers add, subtree delete, property
  updates, multi-element transforms, reparenting, and one-entry drag gestures.
- Task 4 is complete. Selection rendering and hit testing share one handle
  geometry, and select interactions support modifier selection, marquee, move,
  eight-direction resize, rotate, cancellation, and pointer capture.
- Task 5 is complete. Persistence is document-scoped, repository-backed, and
  supports one-time migration from the legacy default-document payload.
- Task 6 is complete. The React adapter now exposes history, multi-selection,
  asynchronous save status, modifier-aware layer selection, and full cleanup.
- Task 7 (full verification and durable handoff) is next.

## Important Files Touched

- `packages/editor/src/event/inputController.ts`
- `packages/editor/src/event/eventManager.ts`
- `packages/editor/src/editor.ts`
- `packages/editor/src/document/editorDocument.ts`
- `packages/editor/src/selection/selectionModel.ts`
- `packages/editor/src/persistence/documentRepository.ts`
- `packages/editor/src/persistence/localStorageDocumentRepository.ts`
- `packages/editor/src/persistence/memoryDocumentRepository.ts`
- `packages/editor/src/public-api.ts`
- `packages/editor/vitest.config.ts`
- `packages/editor/package.json`
- `docs/superpowers/plans/2026-07-26-figma-editor-foundation.md`

## Implemented Behavior

- One `InputController` owns pointer, wheel, context-menu, and keyboard listeners.
- Input state tracks modifiers, pointer buttons, and pointer position.
- Editable targets are identified so editor shortcuts can avoid form controls.
- `SWEditor.destroy()` is idempotent and disposes input and viewport listeners.
- Legacy duplicate `InputManager` and unused `Transformer` implementations were
  removed.
- `EditorDocument` validates IDs and parents, rejects cycles, preserves world
  position during reparenting, removes/restores subtrees, and imports snapshots
  atomically.
- `SelectionModel` supports replace/add/toggle/clear, subtree cleanup, locked and
  hidden filtering, deterministic ordering, and combined bounds.
- Deleting a group clears selection for its complete subtree, locked nodes are
  excluded from Canvas selection, and cyclic reparenting is rejected without
  corrupting the scene graph.
- `CommandManager` exposes undo/redo capability state and excludes failed
  commands. New commands clear redo history.
- Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y, Delete, Backspace, and save shortcuts are
  routed through the unified input pipeline and ignored inside editable fields.
- Continuous drag previews are committed as one transform history entry.
- Transform handles stay eight screen pixels at every zoom and the rotation
  handle stays 24 screen pixels from the selection. Resize and rotation commit
  one history entry; Escape restores the gesture snapshot without adding one.
- Pointer capture keeps gestures active outside Canvas bounds and is released on
  completion or controller disposal.
- `DocumentRepository` isolates snapshots by document ID. The browser and memory
  implementations clone or validate snapshots, expose failures to callers, and
  keep persistence concerns out of `ElementManager`.
- `SWEditor` accepts `documentId` and `repository`, exposes a `ready` promise,
  and saves asynchronously without replacing in-memory state after load errors.
- The `/canvas` workspace exposes accessible undo/redo controls, hides the
  unimplemented comment tool, reports save progress and multi-selection, and
  preserves editor CSS during package tree shaking.

## Verification

- `corepack pnpm -C packages/editor test`: passed, 40 tests.
- `corepack pnpm build:editor`: passed.
- Focused `useEditorCanvas` tests: passed, 3 tests.
- `corepack pnpm -C apps/web typecheck`: passed.
- `git diff --check`: passed with only Windows LF/CRLF conversion warnings.
- The known API Extractor warning about its bundled TypeScript 5.4.2 being older
  than the workspace TypeScript remains non-blocking.

## Blockers

None.

## Next Suggested Step

Begin Task 7 with package documentation, complete automated verification, and
browser verification of `/canvas`.
