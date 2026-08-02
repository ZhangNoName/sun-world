# AI Provider Settings Design

## Goal

Make saving an AI provider profile visibly reliable and present the settings controls with the shared shadcn-style UI primitives.

## Design

`AiProviderSettings` will keep its draft state locally, but own the save interaction state: idle, submitting, and a submit error. Submitting awaits `onSave`; on success it clears the browser-only API key and closes the dialog. On failure it keeps the dialog and displays an accessible error next to the form actions.

The form will use `Field`, `FieldGroup`, and `FieldLabel` from `@sun-world/ui/field`, plus the shared composed `Select` instead of native `<select>`. Existing `Input` and `Button` primitives remain in use. The outer `<form>` retains native required validation and submit semantics.

## Verification

Add a component regression test which submits a valid profile through the real dialog and asserts the asynchronous save completes and closes the dialog. Retain the existing API-key reset coverage and run the AI UI package test suite and build.

## Model Picker Density

Each model option in the composer picker uses one compact row. The model label remains left-aligned and its provider is rendered as a non-interactive tag on the right; the separate provider-description line is removed. The selected-item treatment remains unchanged.
