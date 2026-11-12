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
8. `../docs/agent-handoff.md` - short handoff entrypoint with links to branch
   notes and archives.

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
- Active task handoff starts in `../docs/agent-handoff.md`, but branch-specific
  details live under `../docs/handoff/branches/` and historical checkpoints live
  under `../docs/handoff/archive/`.
- `.ai/` is the lightweight control plane: read it first, then follow links to
  the deeper project documents.
- Do not rename `../docs/` to `.task`; `docs/` remains the durable project
  documentation root. If task context is migrated later, introduce a lowercase
  `.task/` workspace for agent task state, plans, protocols, and relay notes,
  then move files gradually with read-order updates in the same commit.
- Protocol changes must update durable docs first, then be broadcast to active
  subagents and any Claude Code / `claude-ds` task prompt before work continues.

## Cross-project Integration Design

Identity and authorization work must read
[the federated identity and isolation standard](../docs/architecture/federated-identity-and-isolation.md)
and [the security review](../docs/reviews/2026-11-12-federation-security-review.md).
Catalog product IDs are not tenant scopes; logout does not unlink accounts.
SSO, delegation and data isolation remain design requirements, not live features.

Read [the Stars federation plan](../docs/architecture/project-federation-plan.md)
and [the project inventory](../docs/product/project-integration-inventory.md)
for project integration work. Navigation does not grant identity or data access.
Current scope remains design only; production routing has conflicting historical
records and must be verified before any deployment.

## DSH Implementation Entry

Current scope: documentation/design only; do not start implementation without a
new development instruction. File naming, indentation and test placement follow
[repository conventions](../docs/repository-conventions.md). Module permissions,
page slots and project integrations follow
[the extension contract](../docs/architecture/module-extension-contract.md).

For DSH architecture and implementation work, read
[the implementation standard](../docs/architecture/dsh-implementation-standard.md),
[the staged plan](../docs/plans/dsh-platform-implementation.md), and
[the review findings](../docs/reviews/2026-11-12-dsh-architecture-review.md).
The Node Worker, generated module contracts, and product-Skill packaging are
planned boundaries, not deployed features.

## Current Branch Strategy

- `main`: production deploy branch on the server.
- `monorepo-api-import`: current commercial-platform refactor branch.
- Do not deploy `monorepo-api-import` until the backend cutover and final review
  are deliberately approved.
