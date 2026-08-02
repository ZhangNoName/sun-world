# Base UI Package Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate the frozen shadcn/Base UI primitives from Sun World-owned wrappers and patterns without redesigning component styles.

**Architecture:** Add `@sun-world/base-ui` as the low-level primitive package. Keep Sun World protocols and product compositions in `@sun-world/ui`, with a one-way dependency from `@sun-world/ui` to `@sun-world/base-ui`. Application imports must make the ownership visible through the package path.

**Tech Stack:** React 19, TypeScript, Base UI 1.6, Tailwind CSS v4, Vite, Vitest, Corepack pnpm 10.15.1.

## Global Constraints

- Preserve unrelated dirty worktree changes; do not reset, clean, deploy, push, or stage unrelated files.
- Do not run shadcn CLI commands that can overwrite existing components.
- Do not redesign or retheme the existing shadcn/Base UI classes in this refactor.
- `@sun-world/base-ui` owns generic primitive components and their generic styles.
- `@sun-world/ui` owns Sun World protocols, compatibility adapters, and product patterns.
- Do not add a reverse dependency from `@sun-world/base-ui` to `@sun-world/ui`.

## Task 1: Lock the package boundary with a failing static test

**Files:**

- Create: `scripts/check-base-ui-boundary.mjs`

- [ ] Assert that `packages/base-ui/package.json` exists and declares `@sun-world/base-ui`.
- [ ] Assert that the Base UI package exports the generic primitive subpaths.
- [ ] Assert that `packages/ui/package.json` exports only Sun World-owned subpaths and protocol/pattern entry points after migration.
- [ ] Assert that application source does not import generic primitives from `@sun-world/ui`.
- [ ] Run the script and confirm it fails because the package boundary does not exist yet.

## Task 2: Create the frozen `@sun-world/base-ui` package

**Files:**

- Create: `packages/base-ui/package.json`
- Create: `packages/base-ui/tsconfig.json`
- Create: `packages/base-ui/vite.config.ts`
- Create: `packages/base-ui/components.json`
- Create: `packages/base-ui/source-aliases.ts`
- Create: `packages/base-ui/src/index.ts`
- Create: `packages/base-ui/src/lib/cn.ts`
- Create: `packages/base-ui/src/styles/globals.css`
- Create: `packages/base-ui/src/components/*`

- [ ] Move/copy the current generic shadcn/Base UI primitive sources without changing their classes or interaction contracts.
- [ ] Keep Base UI dependencies and generic token styles in this package.
- [ ] Export each primitive through an explicit package subpath and the package root only for package-internal tests.
- [ ] Run the Base UI package test/build cycle.

## Task 3: Keep Sun World ownership in `@sun-world/ui`

**Files:**

- Modify: `packages/ui/package.json`
- Modify: `packages/ui/src/index.ts`
- Modify: `packages/ui/source-aliases.ts`
- Modify: `packages/ui/vite.config.ts`
- Modify: Sun World protocol/pattern imports under `packages/ui/src`

- [ ] Make `@sun-world/ui` depend on `@sun-world/base-ui`.
- [ ] Preserve `SwInput`, `SwSelect`, legacy adapters, toast integrations, and product patterns in `@sun-world/ui`.
- [ ] Keep compatibility APIs working without copying or restyling the Base UI source.
- [ ] Update the package README and the static boundary check to document the ownership rule.

## Task 4: Migrate application and package consumers

**Files:**

- Modify: application and package imports currently using generic primitive subpaths from `@sun-world/ui`.
- Modify: `apps/web/tsconfig.json`, `apps/web/vite.config.ts`, `apps/web/vitest.config.ts`.
- Modify: package-specific source alias configuration where needed.

- [ ] Import generic primitives from `@sun-world/base-ui/*`.
- [ ] Import Sun World protocols and patterns from `@sun-world/ui/*`.
- [ ] Keep loading/compatibility behavior in the Sun World-owned layer.
- [ ] Remove stale generic exports from the Sun World package only after consumers have moved.

## Task 5: Verify and update durable project context

**Files:**

- Modify: `packages/ui/README.md`
- Modify: `docs/engineering-conventions.md` or the focused architecture doc
- Modify: `docs/current-state.md`
- Modify: `docs/agent-handoff.md`

- [ ] Run focused Base UI/UI tests, package builds, Web typecheck/build, boundary checks, format check, and `git diff --check`.
- [ ] Confirm no raw primitive import remains under `@sun-world/ui` in application code.
- [ ] Record the exact verification result and any pre-existing unrelated blockers.
