# Sw Form Protocol Design

## Goal

Remove business-project dependencies on the composed shadcn/Base UI input and
select primitives. Business code uses `SwInput` and `SwSelect`; the UI package
owns all primitive composition and modal compatibility details.

## Boundary

`@sun-world/ui/sw-input` exports `SwInput`. It accepts string `value`,
`onValueChange`, optional `onValueCommit`, standard input attributes, and
protocol-level `label`, `description`, and `error` properties.

`@sun-world/ui/sw-select` exports `SwSelect` and `SwOption`. It accepts
options, controlled or uncontrolled single-value selection, `label`,
`description`, `error`, and `surface`. `surface="modal"` maps internally to
the Base UI `forceMount` behavior required for a Select in a Dialog; callers
never pass `items`, `SelectTrigger`, `SelectContent`, or `forceMount`.

The existing `input` and `select` exports remain UI-package primitives for UI
package internals and specialised component authors. `SunInput`, `SunSelect`,
`LabeledInput`, `SelectField`, and `NativeSelectField` remain deprecated
compatibility adapters during this migration, implemented using the Sw
protocol rather than rendering their own controls.

## Migration

Migrate business consumers to the two protocol imports. The AI provider dialog
uses `SwSelect surface="modal"` and `SwInput`. The article editor uses
`SwInput` for its title; native multi-select category/tag behaviour remains
behind a protocol adapter until a multi-value `SwSelect` contract is added.

## Verification

Unit tests cover the public Sw component behaviour, including option changes
inside a modal surface. AI Workspace regression coverage verifies that selecting
a provider updates all provider defaults. Run UI package tests, AI UI tests,
the relevant Web typecheck/tests, package builds, formatting, and whitespace
checks.
