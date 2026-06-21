---
name: sun-world-ai
description: Use when Codex needs to call Sun World project AI capabilities from this repository, including chat, streaming chat, image generation, or image reading through the local Sun AI CLI. Prefer this skill over direct Python model imports or ad hoc HTTP calls.
---

# Sun World AI

Use `pnpm sun-ai` from the repository root to call curated Sun World AI
capabilities. Prefer a local API at `http://127.0.0.1:8000`; production calls
require explicit user approval and `--allow-production`.

## Workflow

1. Run `pnpm sun-ai inspect` to see available capabilities.
2. Start or verify the local API before making model calls.
3. Call the narrowest CLI command for the task.
4. Keep secrets out of prompts, logs, and handoff files.
5. If an AI route or Python request model changed, run:

```bash
node scripts/check-sun-ai-contract-sync.mjs
node scripts/check-sun-ai-cli.mjs
pnpm check:api
```

Read `references/cli.md` for command examples and safety notes.
