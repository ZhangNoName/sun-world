# Sun AI CLI And Skill Design

## Goal

Build a first-phase agent access layer for Sun World AI capabilities with a
local CLI and repository-scoped Skill.md. The layer must stay synchronized with
the Python/FastAPI AI routes as they evolve.

## Scope

- Add a curated CLI for agent and script use.
- Add a repository skill that tells Codex/Claude-style agents how to use the
  CLI safely.
- Add contract and behavior checks so Python AI route changes break checks
  until CLI/skill expectations are updated.
- Keep production API code separate from agent tooling.

The first phase does not add an MCP server. MCP remains the second-phase
standard adapter after the CLI boundary is stable.

## Architecture

The Python API remains the source of model behavior. The CLI is an HTTP client
that calls the existing FastAPI routes through stable paths from the contract
package. It does not import Python model code.

```text
apps/api FastAPI AI routes
  -> packages/contracts/openapi.json
  -> tools/sun-ai-cli
  -> .agents/skills/sun-world-ai
```

## File Layout

- `tools/sun-ai-cli/src/capabilities.mjs`: curated command-to-route metadata.
- `tools/sun-ai-cli/src/http-client.mjs`: HTTP request and stream helpers.
- `tools/sun-ai-cli/src/cli.mjs`: argument parsing and command dispatch.
- `scripts/check-sun-ai-contract-sync.mjs`: checks curated capabilities against
  `packages/contracts/openapi.json`.
- `scripts/check-sun-ai-cli.mjs`: runs the CLI against a local fake server and
  verifies requests and output.
- `.agents/skills/sun-world-ai/SKILL.md`: concise agent-facing instructions.
- `.agents/skills/sun-world-ai/references/cli.md`: CLI usage details.

Existing files should receive only small integration edits.

## CLI Contract

Commands:

- `inspect`: print curated capability metadata as JSON.
- `chat --message <text> [--session-id <id>]`: POST `/ai/chat`.
- `stream --message <text> [--session-id <id>]`: POST `/ai/chat_stream` and
  pass through SSE/NDJSON-style output.
- `generate-image --prompt <text> [--session-id <id>]`: POST
  `/ai/generate-image`.
- `read-image --uri <url> [--session-id <id>]`: POST `/ai/read-image`.

Defaults:

- Base URL: `SUN_AI_BASE_URL` or `http://127.0.0.1:8000`.
- Session id: `agent-local`.
- Production URLs require `--allow-production`.
- Output should be JSON for non-stream commands and line-oriented text for
  streaming commands.

## Synchronization Rules

- Curated paths and methods must exist in `packages/contracts/openapi.json`.
- JSON request bodies for `chat`, `stream`, and `generate-image` must accept
  `question` and `session_id`.
- `read-image` may remain a query-parameter endpoint until the Python route is
  normalized, but the contract check must assert the current shape.
- `pnpm check:api` must run the CLI contract and behavior checks.
- If Python AI routes change, checks must fail until CLI metadata, behavior, and
  skill references are updated together.

## Skill Decision

A repository skill is required because this workflow is project-specific. It
must live under `.agents/skills/sun-world-ai` so it follows branches and remains
versioned with the API and CLI.

## Verification

Minimum verification before completion:

- `node scripts/check-sun-ai-contract-sync.mjs`
- `node scripts/check-sun-ai-cli.mjs`
- `pnpm check:api`
- `pnpm format:check`
- `git diff --check`
