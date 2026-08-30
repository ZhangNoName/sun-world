# Sun AI CLI Reference

Run commands from the repository root.

## Commands

```bash
pnpm sun inspect
pnpm sun ai models --base-url http://127.0.0.1:8000
pnpm sun ai ask --message "analyze this data" --base-url http://127.0.0.1:8000
pnpm sun ai ask --message "analyze this data" --model-id qwen-public --json \
  --base-url http://127.0.0.1:8000

pnpm sun-ai inspect
pnpm sun-ai generate-image --prompt "sunlit blog cover"
pnpm sun-ai read-image --uri "https://example.com/image.png"
```

`pnpm sun ai ask` consumes the versioned `/ai/v1/runs/stream` SSE protocol and
checks event ordering plus the terminal event. Omit `--model-id` to exercise the
server-selected default. The ID is the catalog record ID returned by
`pnpm sun ai models`, not the upstream model-name field.

## Base URL

The model-aware CLI uses `SUN_WORLD_API_BASE_URL` or
`https://api.sunworld.site`. Pass a local `--base-url` during development. The
legacy CLI uses `SUN_AI_BASE_URL` or `http://127.0.0.1:8000`.

```bash
SUN_WORLD_API_BASE_URL=http://127.0.0.1:8000 pnpm sun ai ask --message "hello"
```

The public model-aware CLI intentionally defaults to the public production API.
Use it only when the task authorizes a production AI call. The legacy CLI
requires its explicit guard flag:

```bash
SUN_AI_BASE_URL=https://api.sunworld.site pnpm sun-ai chat --message "hello" --allow-production
```

## Maintenance

When Python AI routes, request models, or response envelopes change, update the
CLI metadata, this reference, and the skill in the same branch. Then run:

```bash
node scripts/check-sun-ai-contract-sync.mjs
node scripts/check-sun-ai-cli.mjs
pnpm test:cli
pnpm check:api
```
