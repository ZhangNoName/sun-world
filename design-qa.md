# AI Composer Design QA

## Scope

- Reference: `docs/design-qa/ai-composer/chatgpt-work-reference.png`
  (`1192 × 186`, 1× screenshot density).
- Implementation: `docs/design-qa/ai-composer/chatgpt-work-composer-final.png`
  (`940 × 188` crop from the live `/aigc` page at a `1280 × 720` CSS viewport,
  browser DPR `1.5`; the component itself measured `900 × 148` CSS pixels).
- Combined comparison:
  `docs/design-qa/ai-composer/chatgpt-work-composer-comparison.png`.
- Command state:
  `docs/design-qa/ai-composer/chatgpt-work-command-palette.png`.

## Matched state

- Desktop, light theme, empty composer, textarea focused.
- The reference and implementation were reviewed together in the combined
  comparison image.
- The host keeps its own placeholder, model name, and disclaimer copy; the
  reusable component preserves the reference geometry and interaction pattern.
- The host constrains the live composer to `900px`; the package remains
  `width: 100%` and expands to the wider reference container when its consuming
  layout allows it.

## Evidence

- Empty and focused states have identical composer border, background, and
  shadow values.
- Focused textarea computed styles: transparent background, `box-shadow: none`,
  and no visible outline.
- Empty invalid input keeps the submit action disabled without showing an
  inline error.
- Typing `/` opens the searchable command list above the composer with all four
  configured commands; the DOM snapshot exposes the listbox and options.
- The document measured `scrollWidth = clientWidth = 1280`; no desktop
  horizontal overflow was introduced.

## Comparison history

1. Initial live comparison found the composer was `132px` tall and the global
   textarea focus rule still added a blue focus shadow.
2. Increased the composer to `148px`, raised the top inset, matched the `28px`
   corner radius and `40px` submit control, and added an explicit local focus
   reset.
3. Re-captured the focused light-theme state and confirmed identical surface
   styles before and after focus. No P0, P1, or P2 visual issues remain.

final result: passed

## Model selector popover iteration (2026-08-01)

- Implementation capture:
  `docs/design-qa/ai-composer/model-selector-popover-final.png` at the same
  `1280 × 720` desktop viewport and browser DPR `1.5`.
- Live computed geometry: `220px` popover width, `12px` option and label text,
  `10px` description text, `7px 8px` option padding, and no horizontal
  document overflow (`scrollWidth = clientWidth = 1280`).
- Browser interaction evidence: the popover was open before an outside click
  and closed afterward; Escape closed it, set `aria-expanded="false"`, and
  restored focus to the model trigger. Selecting a model also closed the
  popover and restored trigger focus.
- Automated regression evidence: outside pointer dismissal and Escape focus
  restoration both failed against the previous implementation and pass after
  the scoped listener fix.
- No P0, P1, or P2 issues remain in this iteration.

final result: passed
