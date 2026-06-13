# Agent Pipeline Protocol

This protocol defines how Codex, subagents, Claude Code / `claude-ds`, and
manual work pass context between each other.

## Stable Channels

- Durable project context: repository files.
- Current task state: `../../docs/agent-handoff.md`.
- Platform plan: `../plans/platform-roadmap.md`.
- Sync and branch rules: `./sync-protocol.md`.
- Server resource limits: `./server-resource-policy.md`.
- Claude Code entrypoint rules: `../../CLAUDE.md`.

Chat messages may coordinate short-lived work, but they are not the source of
truth for protocols, architecture decisions, or handoff state.

## Role Pipeline

- Main Codex thread:
  - owns architecture direction, task decomposition, integration decisions,
    verification, and final user reporting.
  - should avoid large implementation patches when the user asks it to act as
    architect only.
- `coding` subagent:
  - owns small, bounded implementation patches with explicit write scope.
  - must list changed files and verification commands.
- `阎王` subagent:
  - owns architecture briefs, sequencing, tradeoffs, go/no-go gates, and
    migration strategy.
  - should not perform broad code edits unless explicitly reassigned.
- `判官` subagent:
  - owns code review and risk review.
  - should report findings first, with file and line references.
- `牛头` subagent:
  - owns Claude Code / `claude-ds` communication packets, server-side prompt
    drafting, and server verification command lists.
  - should not run server-side cc unless the main thread explicitly approves.
- Claude Code / `claude-ds`:
  - may receive narrow implementation or server inspection prompts.
  - must read AGENTS.md, CLAUDE.md, `.ai/README.md`, and task-specific docs
    before acting.

## Protocol Sync Rule

Every protocol change must be synchronized in this order:

1. Patch the durable docs.
2. Summarize the delta in plain language.
3. Broadcast that delta to all active subagents.
4. Add the delta to the next Claude Code / `claude-ds` prompt or handoff packet.
5. Run the narrowest validation, usually `git diff --check`.
6. Commit and push when the user asks to sync remote state.

If a subagent was already working when the protocol changed, interrupt or
redirect it before asking it to continue.

## Task Packet Shape

Each delegated task should include:

- current branch and working directory,
- relevant durable docs to read,
- exact objective,
- allowed write scope,
- forbidden actions,
- verification commands,
- expected output format.

For server-side `claude-ds`, also include:

- whether the task is read-only,
- explicit commands that are allowed,
- commands that require user approval,
- a reminder not to read or print secrets, `.env`, `auth.env`, or local override
  files.

## Handoff Shape

When passing work between agents, record:

- current goal,
- status,
- files changed,
- commands run,
- verification result,
- blockers,
- next suggested step.

Use `../../docs/agent-handoff.md` for project work. Use the server-side
`/home/lighthouse/agent-context` only for cross-project or server-level work.
