# Blog compact toolbar design

## Goal

Replace the homepage blog feed's persistent search form and two-choice layout
control with three compact action buttons.

## Interaction

- **Search:** a labelled icon button reveals the existing search input in the
  toolbar and moves focus into it. Enter applies the current keyword. Escape
  or clicking the close action collapses the input without changing the active
  query.
- **Sort:** each activation applies and advances the current query through
  `最新优先`, `浏览量最高`, and `最早优先`, then returns to `最新优先`.
  Its accessible name announces the sort that will be applied.
- **Layout:** a single button toggles list and waterfall layouts on desktop.
  On narrow screens it remains list-only and is disabled with an explicit
  accessible explanation.

## Scope and accessibility

The controls remain in `BlogHomeFeed`; no new icons are needed because the
project already supplies `search`, `list`, and `columns` icons. Each icon-only
button has an `aria-label` and `title`. The search input retains its existing
searchbox role and Chinese accessible name. Existing API query and responsive
layout behavior remain the source of truth.

## Verification

Add UI tests for search expansion/focus and Enter submission, sort cycling and
applied query values, and layout toggling. Run the focused web test file,
`check:web`, and changed-file formatting verification.
