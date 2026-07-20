# @sun-world/ui

Project-owned shadcn/ui components for Sun World.

The primitive source is generated from and maintained against the shadcn
`new-york` baseline. Radix provides compound interaction, CVA provides variants,
and Tailwind CSS v4 consumes the shared semantic theme variables. This is source
ownership, not a black-box component dependency.

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
component styles.

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
corepack pnpm dlx shadcn@latest add <component> -c packages/ui
```

The CLI writes a flat file under `src/components`; move it into
`src/components/<name>/<name>.tsx`, use package-relative imports internally, and
export it from that directory's `index.ts`. This preserves the repository's
one-folder-per-component convention.

## Verification

```bash
corepack pnpm exec node scripts/check-ui-native-shadcn.mjs
corepack pnpm -C packages/ui test
corepack pnpm -C packages/ui build
corepack pnpm check:web
```
