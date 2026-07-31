# AI Composer Status Feedback Design

## Goal

Refine the composer's lower feedback area and make the primary action expose
three unambiguous states: unavailable, ready to send, and generating with a
click-to-cancel stop action. Preserve the package's public props, imperative
handle, submit payload, and host cancellation contract.

## Scope

This iteration changes only the reusable `@sun-world/ai-composer` package and
its visual QA documentation. It does not change upload behavior, model
selection, speech recognition internals, the host AI transport, or mobile
layout beyond inheriting the existing responsive width rules.

## Primary Action State Model

The composer derives one visual action state from existing data:

- `disabled`: there is no non-whitespace Markdown, the selected model is
  missing or disabled, or the composer itself is disabled. The control is a
  muted circular send button, remains natively disabled, and does not show an
  inline validation error.
- `ready`: the Markdown is non-empty, the model is available, and neither
  submission nor generation is active. The control is a dark circular send
  button with a white send icon and submits through the existing `submit()`
  path.
- `generating`: `submitting || loading` is true. The control is a dark circular
  button with a white square stop icon. It is enabled and calls the existing
  `cancel()` function, which stops speech input and invokes `onCancel`.

The state calculation is local presentation logic. It does not add a public
enum or prop. The generating state deliberately covers the interval while the
host's `onSubmit` promise is pending as well as the later host-controlled
streaming interval, preventing a flash back to a disabled send button.

Accessible names are state-specific: `发送消息` for disabled/ready and
`停止生成` for generating. The send control retains `type="submit"`; the stop
control uses `type="button"` so cancel cannot submit the form.

## Feedback Surface

Lower feedback is rendered through one package-private `ComposerNotice`
component with a stable structure and tone modifier. It supports:

- `error`: submission failure, with a subtle red-tinted background and
  `role="alert"`;
- `warning`: rejected files or microphone permission/availability feedback,
  with a subtle amber-tinted background and `role="status"`;
- `neutral`: non-error informational status, with the existing muted palette
  and `role="status"`.

The notice sits inside the composer immediately above the toolbar. It is a
content-width row with a maximum width of the composer, compact padding,
12-pixel text, a small radius, and natural wrapping. It never overlays the
attachment trigger, model selector, microphone, or primary action. Multiple
simultaneous notices remain separate rows so their roles and lifetimes stay
independent.

The existing transient duplicate notice remains above the textarea next to the
attachment strip because it belongs to attachment selection, not submission
feedback. Speech interim text also remains next to the textarea.

## Error Lifetime

A submission error remains visible while the failed draft is unchanged. It is
cleared when any of these actions occur:

- the user edits the Markdown value;
- a new submit attempt starts;
- `reset()` is called;
- a submit succeeds.

Selecting/removing attachments or changing models does not silently clear a
submission error because those actions may be the remedy described by the
message and the user should still see the guidance until they edit or retry.

Rejected-file and speech notices preserve their existing lifetimes and state
sources. This iteration only gives them the shared visual surface.

## Component Boundaries

- `AiComposer.tsx` continues to own state derivation and event routing.
- `feedback/ComposerNotice.tsx` owns notice markup, role, and tone class only.
  It has no timers, transport knowledge, or composer state.
- `styles/ai-composer.css` owns the three visual button states and notice tones.
- No changes are made to `AiComposerProps`, `AiComposerHandle`,
  `AiComposerSubmitPayload`, or `AiComposerSubmitOverrides`.

## Testing

Tests follow red-green TDD and cover observable behavior:

1. Empty input renders a disabled send button.
2. Valid input renders an enabled send button and submits normally.
3. A pending `onSubmit` promise renders an enabled `停止生成` button; clicking
   it invokes `onCancel` without a second submit.
4. Host `loading` renders the same stop state.
5. Submission failure renders the error notice; editing the draft removes it.
6. File rejection and speech permission feedback use the shared warning notice
   without changing their roles or wording.
7. Existing imperative submit/cancel tests continue to pass, proving the public
   API and submit payload remain compatible.

Package tests/build, icon gates when relevant, the repository `corepack pnpm
check` gate, and live `/aigc` browser QA are required before completion.

## Visual QA

Desktop light-theme QA uses the supplied screenshot as the problem reference
and the existing `/aigc` page at 1280 × 720. Verification covers all three
primary-action states, a wrapping submission error, toolbar alignment, and the
absence of composer/document horizontal overflow. P0, P1, and P2 mismatches
must be fixed before handoff.

## Non-goals

- No toast system or global notification dependency.
- No automatic attachment removal or inferred recovery action.
- No spinner-only generating state.
- No new external status enum or callback.
- No redesign of the composer shell, attachment cards, model popover, command
  palette, or speech adapter.
