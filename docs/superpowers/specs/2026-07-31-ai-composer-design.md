# AI Composer Design

## Goal

Build a reusable React package named `@sun-world/ai-composer` that recreates
the desktop Codex composer experience for Sun World. The package provides
Markdown authoring with live preview, deferred file attachments, modular
browser speech input, controlled model selection, a structured slash-command
palette, and an imperative API. The existing `/aigc` workspace will consume
the package in place of its current basic composer.

The first release targets desktop interaction and visual quality. Its public
contracts and layout must leave room for a later mobile-specific pass, but
pixel-level mobile behavior is outside this release.

## Package Boundary

Create `packages/ai-composer` as an independent workspace package. It may
depend on `@sun-world/ui` and `@sun-world/icons`; React and React DOM remain
peer dependencies. It must not request Sun World APIs, upload files, persist
provider state, or own an `AbortController` for the host application's network
request.

The existing `@sun-world/ui/chat-composer` remains a lightweight generic UI
pattern. The new package owns AI-specific composition behavior. The existing
`@sun-world/ai-ui` package imports `@sun-world/ai-composer` and integrates it
into `AiWorkspace`.

The package is divided by responsibility:

```text
packages/ai-composer/
  src/
    AiComposer.tsx
    types.ts
    attachments/
    commands/
    markdown/
    model-selector/
    speech/
    styles/
```

- `AiComposer.tsx` composes the public control and owns short-lived UI state.
- `attachments/` selects, validates, deduplicates, displays, and removes files.
- `commands/` filters commands and owns palette navigation and selection.
- `markdown/` renders a sanitized GFM preview.
- `model-selector/` displays controlled host-provided models.
- `speech/` isolates browser support, permission checks, recognition events,
  error mapping, and cleanup behind an injectable adapter.
- `styles/` implements the Codex-inspired desktop surface using Sun World
  semantic tokens.

## Public Contracts

The package exports the component, its ref handle, its data contracts, and the
speech adapter contract.

```ts
export interface AiComposerModel {
  id: string
  label: string
  description?: string
  group?: string
  disabled?: boolean
}

export interface AiComposerCommand {
  id: string
  label: string
  description?: string
  keywords?: string[]
  shortcut?: string
  disabled?: boolean
}

export interface AiComposerSubmitPayload {
  markdown: string
  files: File[]
  modelId: string
  commandId?: string
}

export interface AiComposerSubmitOverrides {
  markdown?: string
  files?: File[]
  modelId?: string
  commandId?: string
}

export interface AiComposerHandle {
  focus(): void
  setQuestion(markdown: string): void
  submit(overrides?: AiComposerSubmitOverrides): Promise<boolean>
  cancel(): void
  reset(): void
}

export interface AiComposerProps {
  value: string
  onValueChange(value: string): void
  models: AiComposerModel[]
  modelId: string
  onModelChange(modelId: string): void
  commands?: AiComposerCommand[]
  onSubmit(payload: AiComposerSubmitPayload): void | Promise<void>
  onCancel?(): void
  loading?: boolean
  disabled?: boolean
  placeholder?: string
  accept?: string
  maxFiles?: number
  maxFileSize?: number
}
```

The component uses `forwardRef` and `useImperativeHandle`. `setQuestion()`
updates the controlled value through `onValueChange` and focuses the editor.
`submit()` uses the current composer state plus any supplied overrides and
returns `false` without calling `onSubmit` when the payload is not sendable.
It returns `true` only after `onSubmit` resolves successfully and the composer
has requested that its draft be cleared. `cancel()` delegates request
cancellation to `onCancel` and stops active speech recognition. `reset()`
requests clearing of the controlled text and clears internal attachments,
command selection, preview mode, and speech state.

Button submission, keyboard submission, and imperative submission use the
same validation and execution path.

## Desktop Layout And Interaction

The desktop composer follows the supplied Codex references:

- A large rounded card contains the auto-growing editor and bottom toolbar.
- Attachment cards appear between the editor and toolbar and show file name,
  type, size, validation state, and removal control.
- The toolbar places attachment and selected-command controls on the left.
- Model selection, speech, and send/stop controls appear on the right.
- The send control is circular and changes to a stop action while the host is
  loading.
- The editor supports explicit Edit and Preview modes. Preview renders GFM,
  sanitizes HTML, and rejects unsafe link protocols.

Enter submits, while Shift+Enter inserts a newline. Submission is disabled
when the trimmed Markdown is empty, the selected model is absent or disabled,
an attachment is invalid, the component is disabled, or a submission is
already running. These input states do not produce visible error copy; the
disabled control retains an accessible explanation for assistive technology.

## Attachments

Files remain browser `File` objects inside the package until submission. The
package performs no eager upload. It supports multiple selection, duplicate
prevention, removal, an `accept` filter, a maximum count, and a per-file size
limit.

Rejected files never enter the submission payload. The attachment entry may
show a brief lightweight "file not added" state, but it does not open an error
dialog or render an input validation alert. A failed host submission preserves
all valid files for retry. A successful submission clears them.

## Markdown Preview

The editor exposes an Edit/Preview switch and previews the current controlled
Markdown without submitting it. The renderer supports GitHub-flavored
Markdown, including tables, task lists, fenced code, and links. Sanitization
and link-protocol checks match the safety properties of the existing AI block
renderer, but the package must not import the whole `@sun-world/ai-ui` bundle.

## Slash Commands

Typing `/` in an eligible editor position opens a Codex-style palette above
the composer. The palette filters host-provided commands by label,
description, and keywords. It supports mouse input, scrolling, Up/Down,
Enter, Tab, and Escape.

Selecting a command does not insert command syntax into Markdown. It stores a
single structured `commandId` and displays a removable command chip in the
toolbar. Choosing another command replaces the current one. Submission returns
the `commandId` separately from Markdown, so hosts never need to parse command
text.

## Speech Module

Speech uses browser-native speech recognition in the first release. The
speech module is isolated behind an injectable adapter so the UI is not
coupled to vendor-prefixed globals and can later use a server transcription
implementation.

The module exposes stable states: `unsupported`, `checking`, `ready`,
`listening`, `denied`, and `error`. Before starting, it checks secure-context
requirements, browser support, and microphone permission where the Permissions
API can provide it. Permission denial, unsupported browsers, unavailable
devices, and recognition failures map to stable package error codes.

Interim transcript text is visually distinct. Final transcript text appends to
the controlled Markdown at a sensible whitespace boundary. A second microphone
click, submission, cancellation, reset, or component unmount stops recognition
and releases listeners. Permission and support failures are visible near the
composer because a disabled send button alone cannot explain them.

## Model Selection

Models are fully controlled by the host. The package receives model options,
the selected `modelId`, and `onModelChange`. It does not request provider or
profile APIs. The selector supports labels, descriptions, grouping, and
disabled options. Every successful submission contains the final selected
`modelId`.

## State And Submission Flow

The host controls Markdown and model selection. The package owns only
short-lived presentation state: files, selected command, edit/preview mode,
palette state, speech state and interim transcript, and a local asynchronous
submission lock.

Submission follows one path:

```text
button / Enter / ref.submit()
  -> stop speech and merge final transcript
  -> derive current values plus imperative overrides
  -> check sendability
  -> await host onSubmit(payload)
  -> success: clear controlled draft and internal files/command
  -> failure: preserve the complete draft and show a safe submission error
```

The asynchronous lock prevents duplicate submission across buttons, keyboard,
and the imperative API. `cancel()` asks the host to cancel its active request
and stops speech but preserves Markdown, attachments, and the selected command
for editing and retry.

## Error Handling

- Invalid or incomplete input silently disables submission. Imperative
  `submit()` returns `false` for the same state.
- Attachment rejection does not add the file and may show a brief local status.
- Speech errors use stable codes such as `permission-denied`, `not-supported`,
  `no-speech`, and `device-unavailable`, with concise user-facing guidance.
- A rejected `onSubmit` preserves all content and shows a safe error message.
- Unknown submission failures use generic copy and never expose credentials,
  response bodies, or internal exception details.
- Canceling a host request is not treated as a failed submission.

## `/aigc` Integration

`AiWorkspace` replaces `SunChatComposer` with `AiComposer`. Its adapter maps
the current provider/profile information into controlled model options and
passes the selected model back to the existing chat controller.

The Web application owns upload and request orchestration. On submit it uploads
the provided files, converts them into backend references, and then sends the
Markdown, model, structured command, and file references through the AI run
controller. It owns the active `AbortController`, and `onCancel` stops the
current stream.

If the current backend does not yet accept attachments or commands, the Web
adapter must reject such a submission with a clear unsupported-capability
message. It must not silently discard either field. Existing plain Markdown
submissions continue through the current V1 AI flow.

## Accessibility

Every icon-only control has an accessible name. Menus expose appropriate list
or menu semantics, the active option, and keyboard navigation. Closing a menu
returns focus to its trigger. Speech and submission state changes use polite
status announcements. Disabled submission exposes a screen-reader-only reason
without adding visible input error copy.

## Testing And Verification

Package tests cover:

- controlled input, auto-growth, Enter submission, Shift+Enter newline,
  silent disabled states, success clearing, failure preservation, and the
  duplicate-submission lock;
- command triggering, filtering, scrolling, keyboard navigation, selection,
  replacement, removal, and structured `commandId` submission;
- attachment selection, deduplication, limits, removal, and preservation of
  original `File` objects;
- Edit/Preview switching, GFM output, HTML sanitization, and unsafe-link
  blocking;
- speech support and permission states, interim and final transcription,
  denial guidance, cancellation, and unmount cleanup through an injected test
  adapter;
- imperative `focus`, `setQuestion`, `submit`, `cancel`, and `reset` behavior;
- accessible control names, focus restoration, keyboard input, and status
  announcements.

Web integration tests cover provider/profile-to-model mapping, submission into
the current chat controller, cancellation of the active stream, explicit
handling of unsupported attachment/command fields, and preservation of
conversation, retry, editing, and feedback behavior.

Verification runs the new package tests and build, AI UI tests and build, Web
tests and type checking, and the repository's narrowest relevant checks.
Desktop browser QA covers empty and long drafts, attachments, Markdown
preview, the expanded and filtered command palette, model selection, listening
and permission-denied speech states, loading/cancellation, and submission
failure at approximately 1280px and 1440px widths. Mobile is checked only for
catastrophic overflow or unusable controls; detailed mobile design and
pixel-level QA are deferred.

## Out Of Scope

- Pixel-perfect mobile layout and mobile-specific gesture behavior.
- Eager or package-owned file upload.
- Package-owned provider, model, or command API requests.
- Package-owned AI request cancellation or persistence.
- Codex-specific workspace, branch, access-mode, or environment status UI.
- Multiple simultaneous commands in one submission.
- Server-side speech transcription.
