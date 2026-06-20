# AI Sync Protocol

This protocol keeps local Codex, server-side Claude Code/DeepSeek, the Tencent
Cloud working tree, and GitHub aligned.

## Source Of Truth

- GitHub remote: `git@github.com:ZhangNoName/sun-world.git`
- Server repo: `/home/lighthouse/blog/sun-world`
- Local repo: user machine clone of `sun-world`
- Production branch: `main`
- Refactor branch: `monorepo-api-import`

Repository files are durable memory. Chat history is not.

## Role Split

- Codex:
  - design the plan,
  - inspect architecture,
  - make or review changes,
  - run verification,
  - update durable docs,
  - decide whether server-side cc is worth using.
- Claude Code / DeepSeek on server:
  - use only for narrow, low-risk implementation when server resources allow,
  - do not run long builds or dependency-heavy workflows on the small server by
    default,
  - never print secrets or environment values.

## Protocol Change Broadcast

When AGENTS.md, CLAUDE.md, `.ai/`, `docs/engineering-conventions.md`, or any
handoff/sync rule changes:

1. Update the durable repository file first.
2. Send a short delta summary to every active subagent before assigning more
   work.
3. Include the same delta in any Claude Code / `claude-ds` prompt for that task.
4. If the change affects server workflow, keep server-side work read-only until
   the server branch has pulled the protocol update.
5. Record unresolved coordination risk in the relevant handoff file.

Do not rely on chat-only instructions for protocol changes.

## Default Flow For Refactor Work

1. Work locally on `monorepo-api-import`.
2. Run the narrowest useful checks locally.
3. Commit with a Chinese commit message unless the user specifies otherwise.
4. Push local branch to the server repo:

   ```bash
   git push origin monorepo-api-import
   ```

5. On the server, switch to `monorepo-api-import` only long enough to push to
   GitHub or run a server-only verification:

   ```bash
   cd /home/lighthouse/blog/sun-world
   git switch monorepo-api-import
   git push origin monorepo-api-import
   ```

6. Switch the server back to `main`:

   ```bash
   git switch main
   git status --short --branch
   ```

7. If untracked `apps/` appears on server `main`, move it away instead of
   deleting it:

   ```bash
   backup=/home/lighthouse/.local/state/sun-world-untracked-apps-$(date +%Y%m%d-%H%M%S)
   mkdir -p /home/lighthouse/.local/state
   mv apps "$backup"
   ```

8. Verify production health:

   ```bash
   curl -I -fsS https://shop.sunworld.site
   curl -fsS https://api.sunworld.site/healthz
   ```

## Forbidden Sync Actions

- Do not use `git reset --hard`.
- Do not use `git push --force`.
- Do not auto-merge, rebase, or reset if branches diverge.
- Do not deploy `monorepo-api-import` without explicit approval.
- Do not commit `.env`, secrets, certificates, private keys, dependency caches,
  local logs, or generated noise outside intended contract/build outputs.

## Handoff Rules

- Active task state starts at `../../docs/agent-handoff.md`. Branch-specific
  details live in `../../docs/handoff/branches/`; older checkpoints live in
  `../../docs/handoff/archive/`.
- Stable runtime state lives in `../../docs/current-state.md`.
- Architecture decisions live in `../../docs/architecture/`.
- This `.ai` folder is the entrypoint and coordination layer.
- Agent communication and task relay rules live in
  `./agent-pipeline.md`.

Update the relevant handoff file when:

- work pauses,
- work transfers between Codex and Claude Code,
- a branch is pushed but not deployed,
- verification is incomplete,
- a blocker or operational caveat appears.

When handoff notes are archived on any branch other than `main`, commit the
archive update before continuing. On `main`, do not auto-commit archive updates
unless the user explicitly asks.
