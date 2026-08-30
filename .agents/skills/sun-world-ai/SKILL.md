---
name: sun-world-ai
description: Use when Codex needs to call Sun World project AI capabilities from this repository, including model-aware AI V1 chat, image generation, or image reading through the maintained CLIs. Prefer this skill over direct Python model imports or ad hoc HTTP calls.
---

# Sun World AI

Use `pnpm sun` for model discovery and versioned AI V1 chat. Keep `pnpm sun-ai`
for the legacy image-generation and image-reading routes. Prefer a local API at
`http://127.0.0.1:8000`; production calls require explicit user approval.

## Workflow

1. Run `pnpm sun-ai inspect` and `pnpm sun inspect` to see the maintained
   capabilities.
2. Start or verify the local API before making model calls.
3. Run `pnpm sun ai models --base-url http://127.0.0.1:8000` before a
   model-specific request.
4. Use `pnpm sun ai ask` for model-aware text/streaming requests; use
   `pnpm sun-ai` only for a legacy capability not exposed by the public CLI.
5. Keep secrets out of prompts, logs, and handoff files.
6. If an AI route or Python request model changed, run:

```bash
node scripts/check-sun-ai-contract-sync.mjs
node scripts/check-sun-ai-cli.mjs
pnpm test:cli
pnpm check:api
```

Read `references/cli.md` for command examples and safety notes.
