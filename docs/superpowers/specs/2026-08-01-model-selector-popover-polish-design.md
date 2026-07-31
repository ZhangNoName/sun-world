# Model Selector Popover Polish Design

## Goal

Make the standalone AI composer's model selector behave like a lightweight
ChatGPT-style popover: it closes when the user interacts elsewhere, remains
keyboard friendly, and uses a smaller visual scale.

## Confirmed behavior

- Clicking the model trigger toggles the popover.
- A pointer interaction outside the selector closes the popover.
- Pressing `Escape` while the popover is open closes it and restores focus to
  the model trigger.
- Selecting an enabled model keeps the existing behavior: notify the controlled
  host, close the popover, and restore focus to the trigger.
- Interacting inside the popover does not close it unless an enabled option is
  selected.
- Disabled model options remain disabled.

## Visual treatment

- Preserve the current surface, border, radius, shadow, placement, and theme
  tokens.
- Reduce the popover minimum width from `240px` to `220px`.
- Reduce option label text from the inherited `14px` to `12px`.
- Reduce description text from `11px` to `10px`.
- Tighten option padding from `9px 10px` to `7px 8px` while retaining clear
  hover and selected states.

## Component boundary

The behavior stays inside `ModelSelector`. A root ref identifies whether a
pointer event originated inside the selector. Document-level listeners exist
only while the popover is open and are removed on close or unmount. No new
dependency or host API is introduced.

## Accessibility and failure behavior

- Keep `aria-expanded`, `listbox`, `option`, and `aria-selected` semantics.
- Escape and option selection restore trigger focus; outside pointer dismissal
  does not steal focus from the element the user chose.
- Missing models and disabled options continue to use the existing rendering
  and submission safeguards.

## Verification

- Add regression tests that first fail against the current implementation for
  outside pointer dismissal and Escape dismissal with focus restoration.
- Re-run the complete `@sun-world/ai-composer` test suite and package build.
- In the local `/aigc` page, verify trigger toggle, inside interaction, outside
  dismissal, Escape dismissal, option selection, computed font sizes, and
  popover width in both open and closed states.
- Run the repository verification gate before completion.
