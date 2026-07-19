# Native Shadcn UI Migration Design

**Date:** 2026-07-20
**Status:** Approved

## Goal

Replace the current shadcn-inspired Sun World component implementation with a
genuinely shadcn-native, project-owned component system. Standard shadcn APIs
become the application contract, while Sun World and Apple remain switchable
design families implemented through semantic theme variables.

## Architecture

- `packages/ui/src/components/<name>` owns primitive component source copied
  and adapted from the shadcn model.
- Radix UI remains the interaction and accessibility foundation for compound
  controls. CVA and `cn()` remain the variant and class composition tools.
- Tailwind CSS supplies component utilities and consumes standard shadcn
  semantic variables.
- `packages/ui/src/patterns/<name>` owns composed product patterns. Patterns
  consume primitives instead of maintaining an independent visual language.
- `apps/web` imports canonical names such as `Button`, `Input`, `Dialog`, and
  `Select`. Existing `Sun*` names become deprecated compatibility exports only.

## Component Contract

The primitives use standard shadcn composition and naming:

- `Button` exposes `default`, `destructive`, `outline`, `secondary`, `ghost`,
  and `link` variants, standard sizes, `buttonVariants`, and ref forwarding.
- `Card` exposes `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`,
  `CardFooter`, and `CardAction` where supported by the installed baseline.
- Compound Radix components expose their normal parts, including trigger,
  content, item, label, separator, and portal-oriented building blocks.
- Form primitives do not render hidden wrapper elements or embed product-level
  label behavior. Labels and validation copy are composed by consumers.
- `Skeleton` and Sonner use their conventional shadcn names and behavior.

Deprecated `Sun*` exports may adapt old props to the new primitives, but they
must not own separate styling or become dependencies of migrated application
code.

## Styling And Tailwind

- Tailwind is added to the UI build and the web application using the version
  compatible with the repository's Vite toolchain.
- `components.json` becomes executable configuration rather than descriptive
  metadata. Its aliases resolve to real source directories.
- Component CSS is expressed primarily through utility classes. Global CSS is
  limited to Tailwind entry directives, semantic variables, base element rules,
  and theme-family enhancements that cannot be expressed locally.
- The package retains stable public subpaths and library build filenames where
  practical, so package consumers do not need to import source internals.

## Themes

Both design families map to the standard shadcn variable surface:

- `background`, `foreground`, `card`, `card-foreground`
- `popover`, `popover-foreground`
- `primary`, `primary-foreground`
- `secondary`, `secondary-foreground`
- `muted`, `muted-foreground`
- `accent`, `accent-foreground`
- `destructive`, `border`, `input`, `ring`, and `radius`

Sun World remains warm, recognizable, and slightly playful. Apple remains calm,
system-like, materially layered, and spatially precise. Light/dark mode remains
orthogonal to family selection.

Apple enhancements use translucent materials only for floating chrome and
overlays. Motion remains interruptible where gesture-driven, uses short physical
feedback for direct manipulation, and avoids decorative bounce. The UI provides
solid/cross-fade fallbacks for `prefers-reduced-transparency`,
`prefers-reduced-motion`, and `prefers-contrast`.

## Application Migration

- All `apps/web` imports and JSX migrate from `Sun*` primitives to canonical
  shadcn names and composition.
- Custom conveniences such as embedded input labels, `options` props, and
  monolithic dialog/select APIs are replaced by explicit composition.
- Product patterns are migrated after primitives and preserve user-facing
  behavior while adopting the canonical component contracts internally.
- The theme controller and one-click family switch remain behaviorally stable.

## Testing And Verification

The migration is test-driven:

1. Structure checks fail until Tailwind, executable shadcn configuration, and
   canonical components are present.
2. Component contract tests cover refs, variants, compound composition,
   keyboard interaction, accessible names, and deprecated aliases.
3. Theme tests verify both families and all color modes map the complete shadcn
   variable surface.
4. Boundary checks reject new application imports of `Sun*` UI primitives.
5. The complete `corepack pnpm check:web` workflow must pass after migration,
   including TypeScript, React tests, production build, SSG, budgets, and chunk
   boundaries.

## Migration Safety

- Existing `Sun*` compatibility is retained for one migration window and marked
  with `@deprecated` documentation.
- No product workflow, route, API contract, or persisted theme preference is
  intentionally changed.
- The work is performed in an isolated worktree because local `main` is ahead of
  the remote and the migration touches shared build configuration.
- No push or deployment occurs without a separate user request.

## Success Criteria

- shadcn CLI configuration corresponds to the real filesystem and styling
  pipeline.
- Primitive implementations use canonical shadcn APIs rather than `Sun*`
  implementations with aliases.
- `apps/web` contains no imports of `Sun*` UI primitives.
- Sun World and Apple families remain one-click switchable in light, dark, and
  system modes.
- UI package tests, package build, and the full web verification workflow pass.
