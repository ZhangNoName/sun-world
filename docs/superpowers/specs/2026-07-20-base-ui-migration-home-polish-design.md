# Base UI Migration And Home Polish Design

## Goal

Replace the shared UI package's Radix primitives with shadcn's Base UI
implementations while preserving the application's public component contracts,
then refine the homepage typography, alignment, and search toolbar shown in the
reference screenshot.

## Scope

- Migrate every `packages/ui` component and compatibility implementation that
  imports `@radix-ui/*` to `@base-ui/react` or a semantic native element when
  Base UI does not provide a useful primitive.
- Remove all `@radix-ui/*` dependencies after source and lockfile verification
  confirms that the UI package no longer uses them.
- Preserve existing `@sun-world/ui` export paths, canonical component names,
  application-facing event contracts, and legacy `Sun*` compatibility exports
  wherever practical.
- Update `packages/ui/components.json` and `apps/web/components.json` so future
  shadcn additions target the Base UI registry style.
- Remove the visible search and sort labels from the homepage toolbar while
  retaining accessible names through `aria-label` or equivalent Base UI props.
- Refine the homepage profile, weather, toolbar, view switcher, article cards,
  and read-more actions at desktop and mobile breakpoints.

The task does not redesign page content, change API data contracts, remove
labels from forms outside the homepage toolbar, or replace project theme
families.

## Architecture

`@sun-world/ui` remains the stable product-facing boundary. Its canonical
components adapt Base UI primitives to the existing shadcn-style compound APIs,
so application modules continue importing names such as `SelectTrigger`,
`DialogContent`, and `DropdownMenuItem`. Compatibility modules compose those
canonical components instead of importing a second primitive layer.

The migration covers Select, Checkbox, Dialog, Dropdown Menu, Tabs, Tooltip,
Label, Separator, and polymorphic Button/Badge behavior. A component may expose
an additive compatibility prop when Base UI and Radix differ, but existing
application call sites must keep their current observable behavior. Portals,
focus management, keyboard navigation, disabled states, selection state, and
ARIA semantics remain mandatory.

## Homepage Visual Design

The homepage keeps its current two-column card layout and Sun World visual
identity. The refinement uses a smaller, consistent type scale and a shared
vertical rhythm rather than introducing a new visual language.

- Supporting metadata and statistics use a compact size with readable line
  height; article titles retain clear hierarchy.
- Profile statistics and weather metrics use equal-width columns with aligned
  labels and values.
- Card copy aligns to the same internal horizontal inset.
- The toolbar presents search input, sort trigger, and submit button on one
  baseline. Search and sort labels are visually absent; placeholders and
  accessible names carry their meaning.
- Read-more actions align consistently at the trailing edge of each article
  card and do not float into the content area.
- Mobile layout stacks controls with full-width interactive targets and avoids
  clipped or crowded metadata.

## Compatibility And Error Handling

The migration is implemented behind existing exports. Where Base UI event
payloads differ, adapters translate them before invoking current callbacks.
Controlled and uncontrolled modes must both work. Portalled content must keep
the existing stacking behavior, and hydration must not depend on browser-only
state during initial render.

If a legacy prop cannot be represented directly, the adapter will prefer the
existing public behavior over adopting a new upstream API. No silent removal of
application-used props is allowed.

## Testing And Verification

Implementation follows test-driven development:

1. Add or update interaction tests that express the preserved public behavior
   and fail against missing Base UI adapters.
2. Migrate one primitive family at a time and make its focused tests pass.
3. Add homepage tests proving the toolbar has accessible search and sort names
   without visible label elements.
4. Run the UI package tests, web tests/checks, dependency/source guards, type
   checks, and production build.
5. Inspect the local homepage at desktop and mobile viewport sizes, comparing
   typography, alignment, overflow, focus states, and popup positioning against
   the supplied screenshot.

## Acceptance Criteria

- No `@radix-ui/*` import or package dependency remains in `packages/ui`.
- Shared interactive components use Base UI while retaining current public
  imports and required legacy compatibility.
- Homepage search and sort controls have no visible labels and retain accessible
  names.
- Homepage typography and alignment are consistent across the highlighted
  profile, weather, toolbar, and article-card areas.
- Keyboard interaction, focus management, portals, disabled states, and dark
  theme styling remain functional.
- Focused tests, `corepack pnpm test:ui`, `corepack pnpm check:web`, and the
  production build complete successfully.
