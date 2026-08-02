# @sun-world/base-ui

The frozen shadcn/Base UI primitive layer for Sun World.

This package owns the generic shadcn/Base UI registry source: `Button`, `Card`,
`Dialog`, `Select`, `Sheet`, `Sidebar`, `Table`, `Tabs`, and `Tooltip`. These
files are kept as the upstream snapshot; Sun World protocol and product
components belong in `@sun-world/ui`.

Use explicit component subpaths:

```tsx
import { Button } from '@sun-world/base-ui/button'
import { Card, CardContent } from '@sun-world/base-ui/card'
```

Add or update primitives from this package directory:

```bash
corepack pnpm dlx shadcn@latest add @base-ui/<component> -c packages/base-ui
```

`@sun-world/ui` is the consumer-facing Sun World layer. It owns protocol
components such as `SwInput` and `SwSelect`, plus product patterns such as
`ChatShell`, `DatePicker`, and `Pagination`; it may depend on this package but
this package must never depend on `@sun-world/ui`.
