# Agent Handoff

This file is for short-lived context shared between Codex, Claude Code, and manual server work.
Keep stable rules in AGENTS.md, CLAUDE.md, docs/current-state.md, and docs/engineering-conventions.md.

## Rules

- Update this file before switching agents, pausing a task for a long time, or leaving work partially complete.
- Keep entries concise and factual.
- Include the current goal, status, files touched, commands run, verification result, blockers, and next suggested step.
- Do not include secrets, full tokens, passwords, private keys, certificates, or full env values.
- Remove or archive stale entries when they no longer help future work.

## Current Handoff

- Goal: Document agent collaboration, engineering conventions, and context handoff rules for the Sun World project.
- Status: Completed. No active unfinished handoff at this moment.
- Files touched:
  - AGENTS.md
  - CLAUDE.md
  - docs/engineering-conventions.md
  - docs/agent-handoff.md
- Verification:
  - Documentation-only change. No build required.
  - Sensitive-pattern scan was run on the updated docs before commit.
- Next step:
  - Future agents should read this file first and replace this section when starting or pausing a task.
