# @sun-world/ui

Project-owned shadcn-style components for Sun World.

The package keeps the shadcn `new-york` structure and styling conventions while
using Base UI for primitive behavior. `@base-ui/react` is the only third-party
primitive dependency; CVA provides variants, and Tailwind CSS v4 consumes the
shared semantic theme variables. The migration guard rejects `@radix-ui/*`
imports and package dependencies.

## Structure

```text
src/
  components/<name>/  # canonical shadcn primitive, index, compatibility adapter
  patterns/<name>/    # product-level compositions built from primitives
  lib/                # cn() and shared utilities
  styles/             # Tailwind entry and semantic theme bridge
  theme/              # programmatic theme helpers
```

## Usage

Use canonical component names and explicit compound composition:

```tsx
import { Button } from '@sun-world/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sun-world/ui/select'

<Button variant="outline">Save</Button>
<Select value={value} onValueChange={setValue}>
  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
  <SelectContent><SelectItem value="tech">Tech</SelectItem></SelectContent>
</Select>
```

`Sun*` exports are deprecated compatibility adapters. New application code must
not import them. They remain for one migration window and do not own canonical
component styles. Existing package subpaths, canonical compound exports, and
the project-used controlled/uncontrolled callbacks remain stable across the
implementation change.

## Base UI boundary

Simple primitives use Base UI's public render and state APIs. Select, Dialog,
Dropdown Menu, Tabs, and Tooltip adapt Base UI's public compound primitives to
the existing `@sun-world/ui` surface. Product patterns consume those canonical
package components rather than importing Base UI directly.

Compatibility differences and caveats:

- Base UI 1.6 Menu exposes `finalFocus` but no public popup `initialFocus`
  equivalent, so Dropdown Menu does not promise Radix-style initial-focus
  override parity.
- Direct `SelectItem` children and the package's legacy/form adapters resolve
  initial selected labels. An opaque custom, memo, or lazy wrapper whose items
  React cannot inspect must provide Base UI's public `Root.items` metadata.
- `SelectContent forceMount` uses Base UI's public inline
  `Positioner`/`Popup` composition because Select Portal has no keep-mounted
  option. It preserves the closed hidden/inert lifecycle but is intentionally
  non-portalled. There is no application consumer of this compatibility path.
- Compound compatibility content installs one `pointerdown` and one `focusin`
  capture listener on its owner document while mounted. Restricting listeners
  to open layers would require reliable open state across Dialog, Menu,
  Submenu, Select, and Tooltip; the bridge stays behavior-first until that can
  be centralized without weakening outside-interaction cancellation.

## Themes

Tailwind utilities resolve through the standard shadcn variables (`background`,
`foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`,
`destructive`, `border`, `input`, and `ring`). Sun World and Apple map their
tokens onto that surface, so design-family selection and light/dark/system mode
remain independent.

Apple overlay materials retain reduced-transparency, reduced-motion, and
increased-contrast fallbacks.

## CLI

Run the CLI from the repository root and target the UI workspace:

```bash
corepack pnpm dlx shadcn@latest add @base-ui/<component> -c packages/ui
```

The CLI writes a flat file under `src/components`; move it into
`src/components/<name>/<name>.tsx`, use package-relative imports internally, and
export it from that directory's `index.ts`. This preserves the repository's
one-folder-per-component convention.

## Verification

```bash
corepack pnpm exec node scripts/check-ui-native-shadcn.mjs
corepack pnpm test:ui
corepack pnpm check:web
corepack pnpm build
```
