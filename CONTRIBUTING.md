# Contributing to Sun World

Thank you for contributing. This repository is a production monorepo, so keep
changes focused, verifiable, and compatible with its documented runtime.

## Read before changing code

1. `AGENTS.md` — repository safety, Git, deployment, and handoff contract.
2. `docs/engineering-conventions.md` — repository-wide engineering rules.
3. `docs/react-development-guidelines.md` — canonical React and TypeScript
   standard.
4. `docs/current-state.md` — current architecture and production state.

Project-local instructions take precedence over generic framework advice.

## Toolchain

Use the versions declared by the root `package.json`: Node.js 24.17.0 and pnpm
10.15.1. Resolve pnpm through Corepack.

```bash
corepack pnpm install --frozen-lockfile
```

Do not substitute Codex-bundled package managers for the repository toolchain.

## Development workflow

1. Check `git status --short --branch` and keep unrelated local work intact.
2. Read the owning module, its tests, and relevant architecture documents.
3. Make the smallest cohesive change that satisfies the requirement.
4. Add or update tests for behavior changes and regressions.
5. Run the narrowest useful checks while iterating.
6. Run the appropriate merge gate before publishing.
7. Update durable documentation or handoff notes when architecture, runtime, or
   deployment behavior changes.

Useful commands:

```bash
corepack pnpm format:check
corepack pnpm check:web
corepack pnpm check
```

For frontend changes, `corepack pnpm check:web` covers type checking, React
tests, production build, SSG, package boundaries, chunk boundaries, and
performance budgets. Broad or cross-stack changes require the root
`corepack pnpm check` gate.

## Pull requests and commits

- Keep commits focused and use the conventional prefixes documented in
  `docs/engineering-conventions.md`.
- Explain user impact, architecture impact, verification, and known follow-up.
- Do not mix formatting churn, generated output, runtime data, or unrelated
  cleanup into a feature commit.
- Do not force-push or rewrite shared history unless the user explicitly asks
  for that exact operation.
- If local and remote histories diverge, stop and report before integrating.

## Security and local data

Never commit secrets, `.env` values, tokens, passwords, certificates, private
keys, production configuration, local audit logs, uploaded files, or database
data. Do not print secret values during debugging or include them in handoff
documents.

## Frontend requirements

- Follow `docs/react-development-guidelines.md` for React, Hooks, TypeScript,
  naming, accessibility, testing, and Definition of Done.
- Build reusable controls through `@sun-world/ui` and icons through
  `@sun-world/icons/react`.
- Preserve route-level lazy loading, SSG safety, API contract routes,
  performance budgets, and the homepage ICP filing behavior.
