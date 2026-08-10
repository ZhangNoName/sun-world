# UI Consumer Boundary Design

## Goal

Ensure every application and feature-package interaction control is owned by
the Sun World component libraries, while preserving the existing two-layer UI
architecture and current user-visible behavior.

## Architecture

- `@sun-world/base-ui` remains the frozen owner of generic primitives such as
  `Button`, `Textarea`, `Label`, `Dialog`, and `Table`.
- `@sun-world/ui` remains the owner of Sun World protocols and product
  compositions such as `SwInput`, `SwSelect`, and `ChatShell`.
- Consumers import the documented subpath from the package that owns a
  component. Base primitives are not re-exported through `@sun-world/ui`.
- Application and feature-package code must not import third-party UI
  primitives directly or author raw interactive controls.

## Component Changes

- `@sun-world/ai-composer` composes its controls from `base-ui`. Its native
  file input is isolated in a focused `AiFilePicker` adapter because browser
  file selection cannot be represented by the string-valued `SwInput`
  protocol.
- `@sun-world/ai-ui` replaces its raw editor and scrim controls with owned
  primitives and renders structured table blocks with `base-ui` table slots.
- `@sun-world/icons` exports icons only. The unused `SunIconButton` interaction
  component is removed.
- The blog waterfall is moved from the global application component directory
  into the blog module because it depends on blog types and `BlogCard`.
- Unreferenced legacy manage pages are deleted instead of migrated.

## Enforcement

The UI consumer boundary check scans `apps/web/src` and every package source
directory except the two UI-owner packages. It rejects raw `button`, `input`,
`textarea`, `select`, `option`, `label`, `dialog`, and table-slot JSX, except
for the exact native file input adapter. It also rejects direct imports of
third-party UI primitive packages outside their owning packages.

## Behavior And Accessibility

Existing accessible names, roles, keyboard behavior, controlled values,
submit/cancel behavior, file selection, and focus restoration remain stable.
The migration changes ownership and composition, not product behavior.

## Verification

- Run the boundary check once before migration and confirm it fails on the
  existing raw controls.
- Run AI Composer, AI UI, and icon package tests after each migration.
- Run type checks and package builds for affected packages.
- Run the complete repository check after all changes.
