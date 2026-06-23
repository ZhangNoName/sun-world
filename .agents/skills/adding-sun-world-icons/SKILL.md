---
name: adding-sun-world-icons
description: Use when adding, updating, migrating, or reviewing Sun World UI icons, SVG icon data, @sun-world/icons exports, or app icon usage that should keep a consistent Lucide-style line icon system.
---

# Adding Sun World Icons

## Overview

Sun World UI icons live in `packages/icons` as framework-neutral icon data plus thin renderers. Add UI operation icons through `packages/icons/src/data/ui.ts`; do not add new app-local SVGs or direct `lucide-vue-next` imports.

## Workflow

1. Inspect existing names in `packages/icons/src/data/ui.ts` and reuse one before adding a duplicate.
2. Add or update a single `IconDefinition` in `uiIcons`.
3. Keep UI icons Lucide-style: `viewBox: '0 0 24 24'`, no fixed `fill` or `stroke` colors, and nodes only for `path`, `circle`, `rect`, `line`, `polyline`, or `polygon`.
4. If the icon is a logo, third-party mark, mascot, loading artwork, or editor shape asset, keep it out of `uiIcons`; use the existing brand/custom asset path instead.
5. Use `SunIcon` from `@sun-world/icons/vue` in Vue app code. Use `renderIconToSvg` from `@sun-world/icons/core` for framework-neutral HTML/SVG output.
6. Update tests when adding names or behavior.
7. Run verification before reporting completion:
   - `pnpm check:icons`
   - `pnpm test:icons`
   - `pnpm build:icons`
   - For app migrations, also run the narrow app check such as `pnpm -C apps/web exec vue-tsc --noEmit`.

## Import Rules

Use these imports:

```ts
import { SunIcon } from '@sun-world/icons/vue'
import { renderIconToSvg } from '@sun-world/icons/core'
```

Avoid these in app runtime code:

```ts
import { Search } from 'lucide-vue-next'
import searchSvg from '@/assets/svgs/search.svg'
```

## Data Example

```ts
export const uiIcons = {
  plus: {
    name: 'plus',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M5 12h14' }],
      ['path', { d: 'M12 5v14' }],
    ],
  },
} as const satisfies Record<string, IconDefinition>
```

## Common Mistakes

- Adding raw SVG files under `apps/web/src/assets/svgs` for normal UI actions.
- Hard-coding icon colors in data instead of using `currentColor`.
- Copying full Lucide packages into app code instead of copying only the needed SVG nodes into `uiIcons`.
- Treating brand marks as UI operation icons.
