# React Development Guidelines Design

## Context

Sun World has completed its React 19 migration, but the durable engineering
documentation only contains a short set of React conventions. The referenced
ChatGPT conversation describes a broader baseline covering naming, files,
Hooks, effects, TypeScript, state, testing, accessibility, performance, and CI.
That baseline needs to be adapted to this monorepo instead of copied as a
framework-agnostic template.

## Decision

Create one canonical React guideline at
`docs/react-development-guidelines.md`. Keep
`docs/engineering-conventions.md` as the repository-wide entrypoint and add a
root `CONTRIBUTING.md` for contributor workflow. Both documents will link to
the canonical React guideline rather than duplicating it.

The guideline uses three enforcement levels:

1. **Required now** for new or modified React and TypeScript code.
2. **Changed-code migration** for historical names or structures that would be
   risky to rewrite in bulk.
3. **Tooling follow-up** for rules not currently enforced by repository
   configuration, such as React Hooks linting and stricter optional/indexed
   TypeScript checks.

## Project Adaptation

- Preserve the existing `app`, `modules`, `pages`, `shared`, and workspace
  package boundaries instead of imposing a new `features` directory.
- Require application code to consume `@sun-world/ui` and
  `@sun-world/icons/react` rather than importing Radix primitives or ad-hoc SVG
  components directly.
- Treat route-level lazy loading, public SSG safety, API contract routes,
  performance budgets, and the homepage ICP filing as project-specific
  requirements.
- Use the repository-declared Node 24.17.0 and pnpm 10.15.1 toolchain through
  Corepack.
- Do not claim that optional TypeScript flags or React Hooks ESLint rules are
  enforced until configuration actually enables them.

## Code Review

Review the current React surfaces under `apps/web`, `packages/ui`,
`packages/icons`, and React-facing parts of `packages/editor`. Findings will be
written to `docs/reviews/2026-07-17-react-guidelines-review.md` and classified:

- **P1**: likely correctness, security, data-loss, accessibility, or production
  failure.
- **P2**: maintainability or architectural boundary issue likely to cause
  defects.
- **P3**: migration debt or consistency issue suitable for changed-code cleanup.

Every finding must include evidence, an exact file and line, the violated rule,
and a scoped recommendation. The review does not modify application behavior or
perform broad renames.

## Non-Goals

- No bulk rename or directory migration.
- No new lint dependency or TypeScript compiler flag in this change.
- No automatic rewrite of existing Hooks.
- No replacement of the current shadcn/Radix wrapper architecture.
- No production deployment.

## Verification

- Check Markdown links and required headings with a focused Node script or
  PowerShell assertions.
- Run `git diff --check`.
- Run the existing documentation-safe formatting check where applicable.
- Confirm review findings against current line numbers immediately before
  completion.

## Acceptance Criteria

- Contributors have one canonical, project-specific React standard.
- Repository entrypoints link to it without contradictory duplicate rules.
- The document clearly distinguishes enforced rules from future tooling goals.
- The current React codebase has a findings-first review report with traceable
  evidence and no unsupported style-only claims.
