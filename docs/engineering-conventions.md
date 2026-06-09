# Engineering Conventions

These conventions capture the default coding habits for this repository. Prefer local code style when it is more specific.

## Git

- Check `git status --short --branch` before making changes and before committing.
- Keep each commit focused on one purpose.
- Use conventional commit prefixes when they fit:
  - `feat:` for user-visible features.
  - `fix:` for bug fixes.
  - `docs:` for documentation-only changes.
  - `refactor:` for behavior-preserving code restructuring.
  - `chore:` for maintenance.
  - `build:` for build/dependency/deployment changes.
  - `test:` for tests.
- Commit messages should be concise and specific, for example `fix: show ICP filing on mobile layout`.
- Do not commit secrets, .env files, certificates, local logs, dependency caches, or unrelated generated files.
- Do not use `git reset --hard` or `git push --force` unless the user explicitly asks for that exact operation.
- If local and remote history diverge, stop and report the situation.

## File Size

- Keep source files focused on one responsibility.
- As a guideline, split source files when they grow beyond about 500 lines and there is a natural boundary.
- Treat files above 800 lines as refactor candidates unless they are generated, framework-required, or intentionally centralized config.
- Prefer extracting composables, utilities, and child components over adding unrelated logic to an existing component.

## Naming

- Follow existing names in the same folder first.
- Vue components: use PascalCase for component names and component files when the surrounding folder does.
- Composables: use `useXxx` naming.
- Utilities and docs: prefer kebab-case file names.
- Variables and functions: use camelCase.
- Constants: use UPPER_SNAKE_CASE only for true constants that are shared or configuration-like.
- Avoid vague names such as `temp`, `data2`, `newList`, or `handleClick` when the domain action can be named.

## Code Style

- Prefer the existing Vue 3 and Vite patterns already used in the project.
- Keep components scan-friendly: template, script, and style should each have a clear job.
- Avoid introducing new dependencies unless they clearly reduce complexity.
- Use structured APIs/parsers for structured data instead of fragile string manipulation.
- Add comments only for non-obvious behavior, browser quirks, production gotchas, or complex logic.

## Context And Agent Handoff

- Use AGENTS.md and CLAUDE.md for stable agent rules.
- Use `.ai/README.md` as the AI-facing workspace entrypoint for project plans,
  synchronization protocol, and server resource policy.
- Use docs/current-state.md for stable runtime, domain, service, and deployment facts.
- Use docs/agent-handoff.md for short-lived active task state.
- Update handoff notes when work is paused, transferred between Codex and Claude Code, blocked, or completed but not yet deployed.
- Keep handoff entries concise and factual. Include file paths, commands run, verification status, and next step.
- Do not store secrets, full tokens, passwords, private keys, or private env values in handoff notes.

## Data And Database

This repository is frontend-heavy today, but use these defaults for any backend or persistence work.

- Keep database access in a data-access layer, service, or repository module instead of mixing queries into UI or routing code.
- Prefer portable SQL and framework query APIs unless the project explicitly chooses a database-specific feature.
- Document database-specific behavior at the call site or in docs when using PostgreSQL-only, MySQL-only, Mongo-only, or SQLite-only features.
- Use migrations for schema changes and keep them committed with the code that needs them.
- Never concatenate untrusted input into SQL or database filters.
- Make transactions explicit around multi-step writes.
- Add indexes deliberately for new query patterns, especially filtering, sorting, and pagination paths.
- Store timestamps consistently and document timezone assumptions.

## Verification

- Run the narrowest useful verification for the change.
- For frontend changes, prefer `pnpm build:blog` or the documented Docker build when deployment output matters.
- After production deployment, verify:

```bash
curl -I https://sunworld.site
curl -I https://www.sunworld.site
```

- If a command prints known unrelated errors, mention them explicitly instead of hiding them.
