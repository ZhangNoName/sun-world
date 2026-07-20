# Shadcn Base Nova Visual Sync Design

**Date:** 2026-07-20
**Status:** Approved for planning

## Goal

Make every reusable primitive in `packages/ui` visually match the current
official shadcn `base-nova` registry implementation. Keep Base UI as the
behavior and accessibility foundation, preserve the package's public API, and
remove the hand-written Radix/new-york appearance that currently makes controls
such as `Select` look inconsistent with the shadcn examples.

This is a visual and structural synchronization, not a product redesign. Web
pages and patterns continue to compose shared primitives and must not restyle
them into a separate component language.

## Chosen Approach

Use the shadcn CLI to generate each supported `@base-ui` component into an
isolated temporary directory. Treat that generated source as the authoritative
DOM, utility-class, icon, spacing, typography, radius, state, and animation
baseline. Port the baseline into the existing package files, then reapply only
the compatibility behavior required by current consumers.

The CLI must not overwrite the live component directory directly. A direct
overwrite would discard public exports, aliases, loading behavior, callback
adapters, and compatibility required by the application. Manual restyling is
also rejected because it would recreate the drift this work is intended to
remove.

## Scope

The canonical primitives under `packages/ui/src/components` are in scope:

- badge, button, card, checkbox, dialog, dropdown menu, field, input, label;
- select, separator, skeleton, sonner, tabs, textarea, and tooltip.

For components with an official shadcn Base Nova registry entry, generated
source is the visual baseline. Project-only adapters such as legacy toast,
tags, loading wrappers, and `Sun*` compatibility exports do not invent another
appearance; they compose or delegate to the closest canonical primitive.

Patterns under `packages/ui/src/patterns`, including form controls, may change
only as needed to use canonical composition, accessible labeling, and layout.
Application routes, data behavior, API contracts, and product copy are out of
scope.

## Source And Compatibility Boundaries

- `packages/ui/components.json` and the explicit `@base-ui` registry select the
  Base Nova source family.
- Official generated markup and class names remain recognizable and are not
  replaced with the previous Radix/new-york class set.
- Existing canonical exports and package subpaths remain stable.
- Existing `Sun*` exports remain thin deprecated adapters for one compatibility
  window and own no independent visual rules.
- Required project behavior may be retained: loading states, refs, existing
  event signatures, controlled/uncontrolled state, `asChild` compatibility,
  and documented Base UI compound-component adapters.
- Compatibility code must be separated from visual classes so future registry
  refreshes can be reviewed as a source diff instead of a redesign.
- Theme families customize semantic tokens only. Component-local CSS may not
  change geometry or state styling away from Base Nova unless an accessibility
  defect requires it and the exception is documented.

## Form Controls And Select

`form-controls.tsx` remains a composition layer. It supplies layout,
accessible names, validation messages, and product-level behavior, but the
visible trigger, popup, items, indicators, and focus states come from the
shared canonical `Select`.

Visually hidden labels remain available to assistive technology when the
product does not want visible labels. Placeholder text is not treated as the
only accessible name. Popup width, alignment, item spacing, selected state,
and animations follow the official Base Nova implementation.

## Migration Sequence

1. Record the exact shadcn CLI version and generate all scoped Base Nova
   components into a temporary comparison directory.
2. Add source-level contract tests for registry identity and existing public
   behavior before replacing visuals.
3. Synchronize simple primitives first, then compound overlays and form
   controls, keeping compatibility logic isolated.
4. Remove obsolete component-level legacy selectors only after no consumer
   depends on them.
5. Update patterns and Web consumers only where canonical composition requires
   it.
6. Run automated and browser-based visual verification before declaring the
   synchronization complete.

## Testing And Visual Verification

- UI tests cover public exports, refs, variants, loading behavior, controlled
  state, keyboard interaction, focus management, accessible names, and
  compatibility adapters.
- A source guard rejects Radix imports and prevents patterns or Web pages from
  introducing a second visual implementation of canonical controls.
- `corepack pnpm test:ui` and `corepack pnpm check:web` must pass.
- Browser QA covers the homepage and representative form/dialog/menu/tab views
  at desktop and mobile widths, in light and dark mode, for both Sun World and
  Apple theme families.
- Select QA explicitly checks closed trigger alignment, popup anchoring and
  width, selected/check indicators, keyboard navigation, and disabled/error
  states.

## Failure And Rollback Strategy

Changes are applied in small component groups so failures can be traced to a
single registry synchronization. Generated temporary files are comparison
artifacts and are not committed. If a generated API cannot preserve an existing
consumer contract, retain a thin adapter around the official primitive rather
than modifying the official visual structure.

No dependency upgrade, push, deployment, or destructive Git operation is part
of this work unless separately requested.

## Success Criteria

- The form-control Select and all other supported primitives match the current
  shadcn Base Nova structure and visual language.
- `packages/ui` contains no Radix dependency or Radix-style visual fork.
- Patterns and applications consume shared primitives without duplicating
  their trigger, popup, item, button, input, or focus styling.
- Public behavior and accessibility remain compatible with current consumers.
- Automated verification and the defined visual QA matrix pass.
