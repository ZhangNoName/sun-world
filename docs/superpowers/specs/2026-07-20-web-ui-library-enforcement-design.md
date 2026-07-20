# Web UI Library Enforcement Design

## Goal

Make the React Web application consistently render the native shadcn-based
`@sun-world/ui` design system and prevent Web pages from introducing raw
interactive HTML controls.

## Root Cause

The Web entry imports `@sun-world/ui/styles/index.css`, which contains the old
component stylesheet bundle but not the Tailwind v4 and shadcn utility layer in
`packages/ui/src/styles/globals.css`. Canonical shadcn components therefore
render with incomplete utility styles and resemble browser-native controls.
The Web source also contains raw buttons, inputs, labels, and selects, plus two
reusable composition modules under `apps/web/src/shared/ui`.

## Chosen Approach

Use `@sun-world/ui/styles.css` as the single public style entry and make it
resolve to the Tailwind/shadcn global bundle in both source development and
published builds. Move reusable field, dialog, and tabs compositions into
`packages/ui` as component/pattern entrypoints. Replace raw Web interactive
elements with canonical UI imports. Keep native `<form>` elements because they
provide document semantics rather than visual controls; hidden file inputs
must be encapsulated inside a UI-library file-picker component.

Alternative approaches were rejected: styling raw Web elements globally would
hide the architecture problem, while allowing page-local wrappers would keep
duplicating shared behavior outside the UI package.

## Scope

- Canonical public CSS entry with Tailwind v4, shadcn utilities, legacy adapter
  CSS, and Sun World/Apple tokens.
- UI package compositions for labeled fields, select fields, checkbox fields,
  dialog panels, tab views, and file picking.
- Zero raw `button`, `input`, `textarea`, `select`, `option`, `label`, or
  `dialog` JSX elements under `apps/web/src`.
- An automated source guard wired into `check:web`.
- Visual QA of desktop light mode and one-click family switching.

## Verification

The guard must fail before migration and pass afterward. UI tests cover the new
compositions. `format:check`, UI tests/build, `check:web`, and browser visual QA
must all pass before completion.
