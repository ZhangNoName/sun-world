# Sun World AI Workspace

This folder is the AI-facing workspace index for Sun World.

It collects planning, handoff, synchronization, and resource-use rules in one
place so Codex, Claude Code, and future agents can start from the same context
without relying on chat history.

## Read Order

1. `../AGENTS.md` - repository contract and safety rules.
2. `../CLAUDE.md` - server-side Claude Code conventions.
3. `./protocols/sync-protocol.md` - how Codex, Claude Code, server, local, and
   GitHub stay in sync.
4. `./protocols/agent-pipeline.md` - subagent, Codex, and Claude Code
   communication and handoff rules.
5. `./plans/platform-roadmap.md` - commercial platform refactor roadmap.
6. `./protocols/server-resource-policy.md` - what should and should not run on
   the 2-core / 2GB server.
7. `../docs/current-state.md` - current runtime and deployment state.
8. `../docs/agent-handoff.md` - latest task handoff and verification notes.

## Folder Map

```text
.ai/
  README.md
  plans/
    platform-roadmap.md
  protocols/
    agent-pipeline.md
    sync-protocol.md
    server-resource-policy.md
```

## Canonical Sources

- Stable architecture docs stay in `../docs/architecture/`.
- Active task handoff stays in `../docs/agent-handoff.md` because existing
  Codex/Claude skills already read that path.
- `.ai/` is the lightweight control plane: read it first, then follow links to
  the deeper project documents.
- Do not rename `../docs/` to `.task`; `docs/` remains the durable project
  documentation root. If task context is migrated later, introduce a lowercase
  `.task/` workspace for agent task state, plans, protocols, and relay notes,
  then move files gradually with read-order updates in the same commit.
- Protocol changes must update durable docs first, then be broadcast to active
  subagents and any Claude Code / `claude-ds` task prompt before work continues.

## Current Branch Strategy

- `main`: production deploy branch on the server.
- `monorepo-api-import`: current commercial-platform refactor branch.
- Do not deploy `monorepo-api-import` until the backend cutover and final review
  are deliberately approved.
