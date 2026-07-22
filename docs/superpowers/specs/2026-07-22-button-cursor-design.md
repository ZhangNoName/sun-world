# Button cursor feedback

## Goal

Give enabled shared UI buttons a hand cursor on desktop hover, while retaining
the existing disabled feedback.

## Design

The `Button` component already applies a single Tailwind class string to its
native button output and `asChild` composition. Add `cursor-pointer` to that
shared variant definition. Its existing `disabled:pointer-events-none` and
`disabled:opacity-50` rules remain unchanged; the global `.sun-ui-disabled`
rule continues to provide `cursor: not-allowed` for non-native disabled
compositions.

This is intentionally limited to the shared `Button` primitive. Links and
display-only elements keep their current cursor semantics, and no page-local
CSS is changed.

## Verification

Add a focused component contract assertion for the enabled cursor class, run
the UI test suite, and run the changed-file formatting check.
