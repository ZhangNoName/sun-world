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
- Task 2 is in progress. `EditorDocument` and `SelectionModel` exist, are exported,
  and have passing tests. The remaining Task 2 work is to make `ElementManager`
  delegate persistent scene state and transient selection state to these models.

## Important Files Touched

- `packages/editor/src/event/inputController.ts`
- `packages/editor/src/event/eventManager.ts`
- `packages/editor/src/editor.ts`
- `packages/editor/src/document/editorDocument.ts`
- `packages/editor/src/selection/selectionModel.ts`
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

## Verification

- `corepack pnpm -C packages/editor test`: passed, 10 tests.
- `corepack pnpm build:editor`: passed.
- `git diff --check`: passed with only Windows LF/CRLF conversion warnings.
- The known API Extractor warning about its bundled TypeScript 5.4.2 being older
  than the workspace TypeScript remains non-blocking.

## Blockers

None.

## Next Suggested Step

Continue Task 2 with a compatibility migration of `ElementManager`: delegate its
store/tree methods to `EditorDocument`, delegate selected IDs and bounds to
`SelectionModel`, keep marquee interaction as transient adapter state, migrate
legacy snapshot hydration through `EditorDocument.importSnapshot`, then run all
editor tests and build before marking Task 2 complete.

