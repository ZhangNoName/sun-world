# ChatGPT Work Composer Polish Design

## Goal

Make `@sun-world/ai-composer` match the supplied ChatGPT Work-mode composer reference while preserving its reusable controlled API, attachments, commands, model switching, speech input, submission, and cancellation behavior.

The supplied 1192×186 screenshot is the visual source of truth. The public `chatgpt.com` page is auxiliary only because the referenced Work-mode state may require account-specific access.

## Interaction Design

- The composer is always a Markdown source editor. It has no preview/edit toggle and never replaces the textarea with rendered Markdown.
- Markdown remains part of `AiComposerSubmitPayload.markdown`; rendered assistant/user messages remain the host application's responsibility.
- Typing or focusing the textarea must not change the composer's border, shadow, background, or outline.
- Pointer focus on toolbar controls must not leave a visible ring. Keyboard `:focus-visible` treatment remains for accessible navigation.
- Empty input keeps the send action disabled without showing a visible validation message.
- Existing attachment, slash-command, model, speech, loading/cancel, async submission, and imperative-ref behavior remains unchanged.

## Visual Design

- One white/elevated rounded rectangle with a subtle neutral border and soft shadow.
- Approximately 28–30px corner radius at the desktop reference size.
- A tall, uninterrupted text area with muted placeholder text and no top-right mode control.
- One bottom toolbar: add/access controls on the left; model, microphone, and circular send/cancel control on the right.
- No focus-within border color, glow, or outline on the composer or textarea.
- Existing responsive overflow protection remains; full mobile redesign is outside this correction.

## Code Changes

- Remove preview state, preview toggle, and `MarkdownPreview` rendering from `AiComposer`.
- Remove composer-only Markdown renderer files, styles, dependencies, and tests if no public API consumes them.
- Add component regression coverage proving the preview control is absent and textarea focus does not introduce a composer focus state.
- Retain keyboard-only focus visibility for actionable toolbar controls.
- Update package documentation and project handoff notes to describe Markdown source submission rather than live preview.

## Verification

- Run the new regression test red before implementation and green afterward.
- Run all composer and AI UI tests, package builds, Web typecheck, and the narrow AI interface guard.
- Render `/aigc` locally at the reference desktop state, capture it, and compare it beside the supplied screenshot.
- Verify an empty and a focused/typing state, including computed border/outline/box-shadow values and absence of horizontal overflow.
- Record the comparison in `design-qa.md`; completion requires `final result: passed` with no P0–P2 mismatch.
