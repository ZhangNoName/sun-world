# @sun-world/editor

`@sun-world/editor` is Sun World's framework-neutral Canvas 2D editor core. It
provides the document, selection, command history, input, viewport, rendering,
tool, and persistence layers used by the Web `/canvas` workspace.

## Architecture

- `SWEditor` is the public facade and lifecycle owner.
- `EditorDocument` owns the persistent scene tree and enforces document
  invariants such as unique IDs, valid parents, cycle prevention, atomic
  snapshot import, and stable subtree restoration.
- `SelectionModel` owns transient selected IDs and combined bounds. Locked or
  hidden elements cannot enter Canvas selection.
- `CommandManager` owns undo and redo stacks. Document changes and completed
  transform gestures are reversible commands.
- `InputController` is the single Pointer Events and keyboard input owner.
- Tools implement interaction state machines; the select tool supports click,
  additive/toggle selection, marquee, move, eight-direction resize, rotate,
  pointer capture, and Escape cancellation.
- `CanvasRenderer` renders document content and selection controls from the same
  handle geometry used for hit testing.
- `DocumentRepository` isolates persistence from editor state. Browser storage
  and in-memory implementations are included.

## Basic Usage

```ts
import { SWEditor } from '@sun-world/editor'

const editor = new SWEditor({
  containerElement: document.querySelector('#editor') as HTMLDivElement,
  documentId: 'homepage-wireframe',
})

await editor.ready
editor.setTool('rect')
await editor.save()

editor.undo()
editor.redo()
editor.destroy()
```

Pass a custom `DocumentRepository` through `repository` when storage belongs to
an application service. `MemoryDocumentRepository` is useful for tests. The
default `LocalStorageDocumentRepository` stores versioned snapshots per
`documentId` and migrates the old `editor-data` payload into `default` once.

## Input and Selection

- Click replaces selection.
- Shift-click adds to selection.
- Ctrl-click or Command-click toggles selection.
- Dragging empty Canvas creates a marquee selection.
- Dragging selected content moves it; handles resize or rotate it.
- Pointer-up creates one history entry for the complete gesture.
- Escape restores the gesture-start snapshot without changing history.
- Ctrl/Command+Z undoes; Ctrl/Command+Shift+Z and Ctrl+Y redo.
- Delete and Backspace remove selected elements.
- Ctrl/Command+S saves. Editor shortcuts are ignored in editable controls.

## Development

From the repository root:

```bash
corepack pnpm -C packages/editor test
corepack pnpm build:editor
```

## Current Non-goals

This foundation does not yet implement collaboration, vector paths, text
editing, Auto Layout, components/instances, constraints, snapping guides, or
server-side version history.
