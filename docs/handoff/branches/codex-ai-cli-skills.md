# codex/ai-cli-skills Handoff

## Current Goal

Design and implement the first-phase Sun World AI agent access layer: a local
CLI plus repository-scoped Skill.md instructions that call existing Python API
model capabilities through stable contracts.

## Status

- Branch codex/ai-cli-skills was created from main.
- Stale tracked file nginx000.conf was removed and committed as
  8a50348b chore: remove stale nginx config.
- Research completed: MCP is the likely second-phase standard tool layer;
  first phase should be CLI + Skill.md, with MCP added later as a separate
  adapter.
- First-phase CLI + Skill.md implementation is complete locally and ready for
  review on this branch.

## Important Files Touched

- nginx000.conf deleted.
- docs/agent-handoff.md split into a short active entrypoint.
- docs/handoff/README.md documents the handoff split protocol.
- docs/handoff/archive/2026-06-20-platform-checkpoints.md stores historical
  handoff entries.
- docs/handoff/branches/codex-ai-cli-skills.md stores this branch's active
  state.
- docs/superpowers/specs/2026-06-20-sun-ai-cli-skill-design.md records the
  approved design.
- docs/superpowers/plans/2026-06-20-sun-ai-cli-skill.md records the
  implementation plan.
- tools/sun-ai-cli/src/ contains the Sun AI CLI.
- scripts/check-sun-ai-contract-sync.mjs checks OpenAPI route drift.
- scripts/check-sun-ai-cli.mjs checks CLI behavior against a fake local API.
- .agents/skills/sun-world-ai/ contains the repository-scoped skill.
- package.json, scripts/run-api-check.mjs, and
  scripts/check-platform-goal-audit.mjs wire the checks into project
  verification.

## Commands Run

- git switch -c codex/ai-cli-skills
- git add -- nginx000.conf
- git commit -m "chore: remove stale nginx config"
- Research used current web docs for MCP, Codex Skills, Claude Skills,
  FastMCP OpenAPI, LangChain OpenAPI Toolkit, Composio, and Pipedream.

## Verification Result

- Current branch was clean after the stale Nginx config commit.
- `node --check scripts/check-platform-goal-audit.mjs` passed.
- `node scripts/check-platform-goal-audit.mjs` passed.
- `git diff --check` passed with Windows CRLF conversion warnings only.
- Pending verification for the new archive-auto-commit rule will be recorded in
  the commit that saves this protocol update.
- `pnpm sun-ai inspect` passed.
- `pnpm check:sun-ai:contracts` passed.
- `pnpm check:sun-ai:cli` passed.
- `pnpm check:api` passed and now runs the Sun AI CLI checks before Python API
  checks.

## Blockers

- None known.

## Next Suggested Step

Review the CLI + Skill.md implementation, then decide whether to add MCP as a
second-phase adapter after this CLI boundary has been used in practice.
