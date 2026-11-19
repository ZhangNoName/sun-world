# @sun-world/ui

Sun World protocol components and product-level compositions.

Generic shadcn/Base UI primitives live in `@sun-world/base-ui`. This package
depends on that package and adds the project-owned layer: `SwInput`, `SwSelect`,
toasts, loading surfaces, theme integration, and composed patterns.

## Structure

```text
src/
  components/<name>/  # Sun World protocols and integrations
  compat/<name>/      # deprecated Sun* adapters only
  patterns/<name>/    # product-level compositions built from base-ui
  lib/                # cn() and shared utilities
  styles/             # Tailwind entry and semantic theme bridge
  theme/              # programmatic theme helpers
```

## Usage

Use the shared control that owns the interaction. For single or multiple
selection, use `SwSelect`.

```tsx
import { SwSelect } from '@sun-world/ui/sw-select'

<SwSelect
  label="Category"
  options={[{ value: 'tech', label: 'Tech' }]}
  value={category}
  onValueChange={setCategory}
/>
```

`SwSelect multiple` accepts and emits `string[]`. Use `size="sm"` for a
compact trigger. The options open below the trigger when space permits. The
popup can flip above near the viewport edge. `SwNativeSelect` and
`NativeSelectField` are compatibility exports.

Use `SwTooltip` from `@sun-world/ui/sw-tooltip` for short hints on hover and
keyboard focus. Give icon-only controls their own accessible name.

Use `SwCollapsible` from `@sun-world/ui/sw-collapsible` to reveal optional
inline content. The `trigger` supplies the button label and `children` supplies
the expandable panel.

`Sun*` exports are deprecated compatibility adapters. New application code must
not import them. The base primitives are intentionally not re-exported from
this package, so an import path now identifies the owning layer.

## Base UI boundary

`@sun-world/base-ui` contains the generic primitive source and public Base UI
compound components. Product patterns in this package consume those exports;
application code should import from the owning package directly.

Compatibility differences and caveats:

- `@sun-world/base-ui` follows the current Base Nova API. Its callbacks may
  include Base UI event-details objects, and its composition uses `render`
  instead of Radix-style `asChild`.
- `@sun-world/ui` protocol adapters translate legacy Sun World callback and
  prop shapes at the boundary. They do not patch the Base UI source or restore
  Radix-only props on the base package.
- `SwSelect surface="modal"` is a Sun World surface marker only; the popup
  keeps Base UI's standard portal behavior. Dialog-safe placement must be
  treated as an application/layout concern rather than a change to the frozen
  primitive.
- Compound compatibility content owns any temporary interaction bridge needed
  by deprecated `Sun*` adapters. New application code should use `Sw*`
  protocols or the direct base primitive instead.

## Themes

Tailwind utilities resolve through the standard shadcn variables (`background`,
`foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`,
`destructive`, `border`, `input`, and `ring`). Sun World and Apple map their
tokens onto that surface, so design-family selection and light/dark/system mode
remain independent.

Apple overlay materials retain reduced-transparency, reduced-motion, and
increased-contrast fallbacks.

## CLI

Run the CLI against the base package only:

```bash
corepack pnpm dlx shadcn@latest add @base-ui/<component> -c packages/base-ui
```

The CLI writes the primitive into `packages/base-ui/src/components`. Do not
copy base primitives into `packages/ui`; add Sun World behavior there only when
it is a real protocol or product composition.

## Verification

```bash
node scripts/check-ui-native-shadcn.mjs
node scripts/check-web-ui-library.mjs
corepack pnpm test:ui
corepack pnpm check:web
corepack pnpm build
```
