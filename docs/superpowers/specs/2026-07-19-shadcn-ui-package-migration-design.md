# Shadcn-Style UI Package Migration Design

## Objective

Reorganize `packages/ui` into a fully project-owned shadcn-style component
library. Every component owns its implementation, styles, tests, and public
entrypoint in one directory. Existing application imports and runtime behavior
remain compatible throughout the migration.

## Decisions

- Shadcn is an ownership model, not a runtime package dependency. Sun World
  continues to own and modify all component source.
- Radix UI remains the accessibility and interaction foundation for complex
  primitives. CVA, `clsx`, and `tailwind-merge` remain the variant/class tools.
- Existing semantic CSS variables remain authoritative so Sun World, Apple,
  light, dark, system, reduced-motion, reduced-transparency, and increased-
  contrast modes continue to work.
- Existing public imports such as `@sun-world/ui/button` remain stable.
- Existing `Sun*` component names remain compatible. Canonical shadcn-style
  names such as `Button` may be exported as aliases where they improve
  composition, but application migration to those aliases is not required by
  this structural change.
- No Tailwind runtime or generated utility stylesheet is introduced. The
  package keeps authored CSS because the repository already has a mature token
  system and the components are distributed as a library.

## Package Structure

```text
packages/ui/src/
  components/
    button/
      button.tsx
      button.css
      button.test.tsx
      index.ts
    card/
    checkbox/
    dialog/
    dropdown-menu/
    input/
    label/
    select/
    tabs/
    tag/
    textarea/
    toast/
    tooltip/
    loading-skeleton/
  patterns/
    chat-composer/
    chat-shell/
    date-picker/
    list/
    pagination/
    theme-provider/
  lib/
    cn.ts
  styles/
    base.css
    index.css
  index.ts
```

Primitive components live in `components`; higher-level assemblies and
application patterns live in `patterns`. Each directory has a local `index.ts`
as its only supported internal entrypoint. Component-specific CSS moves beside
the component. Only package-wide reset, shared field rules, tokens, and the
optional all-styles entry remain under `src/styles`.

## Public API And Build

The package exports map remains stable. For example,
`@sun-world/ui/button` continues to resolve to the built `button` entry. Vite
library entries resolve the component directory entrypoints rather than the
current root forwarding files. The root `@sun-world/ui` entry re-exports all
public directory entrypoints, but applications continue to prefer subpaths for
tree shaking.

Temporary root forwarding files are removed once all Vite entries, TypeScript
paths, tests, and source imports resolve through the new directories. Generated
declarations must not expose obsolete `components/Sun*.tsx` paths.

## Component API Strategy

The first migration preserves behavior exactly. This is primarily a structural
refactor, not a redesign. Existing props, accessibility behavior, loading and
disabled states, controlled values, and emitted callbacks remain intact.

Where a primitive already follows shadcn conventions, its variant function is
exported for composition when useful. Compound components such as Card may
expose additive aliases (`Card`, `CardHeader`, `CardContent`) while preserving
`SunCard`. Destructive renames and broad application import rewrites are outside
this migration.

## Styling

Every component imports shared `base.css` and its colocated stylesheet. The
global `styles/index.css` imports all component styles for intentional full-
library consumers. Component selectors retain the `sun-` namespace to avoid
collisions in consuming applications.

No component may hard-code a theme family. Components consume semantic tokens;
theme-family differences stay in the design-token layer. Radix portals remain
compatible with document-level theme attributes.

## Tests And Migration Guard

Migration is test-driven and incremental:

1. Add a package-structure contract that fails while root forwarding files and
   flat component files remain.
2. Move shared primitives in dependency order: utilities/label, form controls,
   overlays, display components.
3. Move higher-level patterns after their primitive dependencies.
4. Update build entries, exports, README, and global style aggregation.
5. Remove obsolete flat source files only after all focused tests pass.

Each component retains or gains colocated interaction tests. The existing React
contract suite remains as cross-component compatibility coverage. Required
final verification is `corepack pnpm -C packages/ui test`,
`corepack pnpm -C packages/ui build`, and `corepack pnpm check:web`.

## Compatibility And Failure Handling

- Public subpath imports must not change.
- The package root export remains supported.
- CSS entry `@sun-world/ui/styles.css` remains supported.
- Build output names remain `button.es.js`, `select.es.js`, and equivalent.
- The migration stops on any declaration, bundle-boundary, theme, accessibility,
  or application test regression.
- No dependency upgrades are bundled into the migration.

## Completion Criteria

- Every public UI unit lives in its own directory with implementation, styles,
  local entrypoint, and relevant tests.
- Primitives and higher-level patterns are separated.
- No obsolete `src/components/Sun*.tsx`, root component forwarding files, or
  component-specific flat styles remain.
- Existing application imports compile unchanged.
- UI package tests/build and the full frontend check pass.
- Package documentation describes React and the new ownership model accurately.
