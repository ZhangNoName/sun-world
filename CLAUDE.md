# CLAUDE.md

Follow the same project contract as AGENTS.md.

## Role

Claude Code is used as a server-side coding assistant through the claude-ds wrapper.
The wrapper loads DeepSeek-compatible Anthropic API settings from:

```bash
~/.config/deepseek/claude-code.env
```

Use it from the repository root:

```bash
cd /home/lighthouse/blog/sun-world
claude-ds
```

## Operating Rules

- Read AGENTS.md and docs/current-state.md first.
- Prefer small, reviewable changes.
- Show and explain diffs before committing when possible.
- Keep all persistent context in repository docs, not only in the conversation.
- Never print API keys, tokens, .env values, SSH keys, private certificates, or passwords.
- Never expose Claude Code itself over a public web domain.
- Use the website domains only for viewing application results, not for controlling the agent.

## Recommended Workflow

1. Understand the task and inspect relevant files.
2. Make scoped edits.
3. Run the narrowest useful verification.
4. Summarize changes and any risks.
5. Commit to main only when the user asks or when the workflow clearly requires it.
6. Let the daily auto deploy pick up main, or manually run the deploy service for urgent updates.
