# @sun-world/ui

Project-owned shadcn-style React components for Sun World.

The package follows the shadcn ownership model: component source is kept in
this repository, complex interaction is built on Radix UI, variants use CVA,
and styles consume Sun World's semantic design tokens. Shadcn is not installed
as a runtime component dependency.

## Structure

```text
src/
  components/       # reusable UI primitives
    button/
      button.tsx
      button.css
      index.ts
  patterns/         # composed application patterns
    chat-composer/
  lib/               # shared class utilities
  styles/            # shared foundations and all-styles entry
  theme/             # theme types and variable helpers
```

Every public UI unit owns its implementation, stylesheet, and entrypoint in one
directory. Add tests beside the relevant component or extend the shared React
contract suites when behavior spans multiple components.

## Imports

Prefer stable component subpaths so consumers only load what they use:

```tsx
import { Button, SunButton } from '@sun-world/ui/button'
import { Select, SunSelect } from '@sun-world/ui/select'
import { ChatComposer } from '@sun-world/ui/chat-composer'
```

`Sun*` names are compatibility exports. Canonical aliases such as `Button`,
`Card`, `CardHeader`, and `Input` are available for shadcn-style composition.
The root `@sun-world/ui` entry remains supported for intentional full-library
consumers.

## Styling And Themes

Components import `src/styles/base.css` and their colocated stylesheet. Apps
that intentionally want every component style can import:

```ts
import '@sun-world/ui/styles.css'
```

Components use semantic variables rather than hard-coded theme-family colors.
Sun World, Apple, light, dark, system, reduced-motion, reduced-transparency,
and increased-contrast behavior belongs to the consuming token layer.

## Adding Or Updating A Component

1. Put primitives in `src/components/<kebab-name>` and composed UI in
   `src/patterns/<kebab-name>`.
2. Keep `<name>.tsx`, `<name>.css`, and `index.ts` together.
3. Preserve the `sun-` CSS namespace.
4. Add the entry to `vite.config.ts`, `package.json`, and `source-aliases.ts`.
5. Write a failing behavior or structure test before implementation.
6. Verify public subpath imports and semantic theme behavior.

## Commands

```bash
corepack pnpm -C packages/ui test
corepack pnpm -C packages/ui build
corepack pnpm exec node scripts/check-ui-shadcn-structure.mjs
corepack pnpm check:web
```
