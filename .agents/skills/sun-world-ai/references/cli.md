# Sun AI CLI Reference

Run commands from the repository root.

## Commands

```bash
pnpm sun-ai inspect
pnpm sun-ai chat --message "hello" --session-id agent-local
pnpm sun-ai stream --message "draft an outline"
pnpm sun-ai generate-image --prompt "sunlit blog cover"
pnpm sun-ai read-image --uri "https://example.com/image.png"
```

## Base URL

The CLI uses `SUN_AI_BASE_URL` or `http://127.0.0.1:8000`.

```bash
SUN_AI_BASE_URL=http://127.0.0.1:8000 pnpm sun-ai chat --message "hello"
```

Production requires explicit approval and a guard flag:

```bash
SUN_AI_BASE_URL=https://api.sunworld.site pnpm sun-ai chat --message "hello" --allow-production
```

## Maintenance

When Python AI routes, request models, or response envelopes change, update the
CLI metadata, this reference, and the skill in the same branch. Then run:

```bash
node scripts/check-sun-ai-contract-sync.mjs
node scripts/check-sun-ai-cli.mjs
pnpm check:api
```
