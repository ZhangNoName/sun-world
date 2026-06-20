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
- No CLI or skill implementation files have been created yet.

## Important Files Touched

- nginx000.conf deleted.
- docs/agent-handoff.md split into a short active entrypoint.
- docs/handoff/README.md documents the handoff split protocol.
- docs/handoff/archive/2026-06-20-platform-checkpoints.md stores historical
  handoff entries.
- docs/handoff/branches/codex-ai-cli-skills.md stores this branch's active
  state.

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

## Blockers

- None known.

## Next Suggested Step

Create and review the CLI + Skill.md design spec before implementing files under
tools/ and .agents/skills/.
