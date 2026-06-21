# Handoff Workspace

This folder keeps active and archived agent handoff notes out of the short
entrypoint at `../agent-handoff.md`.

## Files

- `../agent-handoff.md`: short active entrypoint. Keep branch links, the latest
  stable checkpoint, and archive pointers here.
- `branches/<branch-slug>.md`: active or recently paused work for a specific
  branch. Use the Git branch name with `/` replaced by `-`.
- `archive/<date>-<topic>.md`: completed or stale historical checkpoint groups.

## Update Rules

- For branch work, update the matching file under `branches/` instead of adding
  long notes to `../agent-handoff.md`.
- For mainline stable state, keep the latest checkpoint in
  `../agent-handoff.md` and move older checkpoints into `archive/`.
- Before merging a feature branch, either archive its branch handoff or keep a
  short pointer if another agent still needs it.
- On any branch other than `main`, commit archive updates immediately after
  verifying them. On `main`, leave archive updates uncommitted unless the user
  explicitly asks to commit.
- Do not store secrets, full tokens, passwords, private keys, certificates, or
  full environment values in any handoff file.
