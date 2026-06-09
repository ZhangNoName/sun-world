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
4. `./plans/platform-roadmap.md` - commercial platform refactor roadmap.
5. `./protocols/server-resource-policy.md` - what should and should not run on
   the 2-core / 2GB server.
6. `../docs/current-state.md` - current runtime and deployment state.
7. `../docs/agent-handoff.md` - latest task handoff and verification notes.

## Folder Map

```text
.ai/
  README.md
  plans/
    platform-roadmap.md
  protocols/
    sync-protocol.md
    server-resource-policy.md
```

## Canonical Sources

- Stable architecture docs stay in `../docs/architecture/`.
- Active task handoff stays in `../docs/agent-handoff.md` because existing
  Codex/Claude skills already read that path.
- `.ai/` is the lightweight control plane: read it first, then follow links to
  the deeper project documents.

## Current Branch Strategy

- `main`: production deploy branch on the server.
- `monorepo-api-import`: current commercial-platform refactor branch.
- Do not deploy `monorepo-api-import` until the backend cutover and final review
  are deliberately approved.
