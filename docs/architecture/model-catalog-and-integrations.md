# Model Catalog And Platform Integrations

## Decision

Sun World separates two concerns that share a client but not an execution
boundary:

- the AI model catalog selects OpenAI-compatible inference services;
- the integrations catalog describes reviewed adapters such as Feishu and
  Zhihu.

`@sun-world/cli` is the public client for both domains. AI commands call the
Sun World API. Integration commands execute an explicitly selected official
CLI on the caller's machine. The API process only exposes a secret-free
capability catalog and never spawns third-party CLIs.

## Model Catalog

`ai_provider_catalog` remains the source of truth for managed models. A record
contains a stable ID, display name, upstream base URL, upstream model name,
authentication mode, enabled/default state, sort order, and optional encrypted
credential metadata.

Rules:

- `auth_mode=none` is allowed only for an explicitly reviewed keyless service.
- `auth_mode=bearer` requires an encrypted API key. Responses expose only
  `has_api_key` and a masked hint.
- bearer-authenticated catalog records and all personal provider profiles must
  use HTTPS; credentials are never sent over an insecure transport.
- exactly one enabled record is selected as default by serialized catalog
  writes; clients may also select an enabled record by `model_id`.
- public model discovery never returns credentials.
- the initial public default is `qwen38_27b` at
  `http://211.141.18.165:6195/v1`.

The upstream is currently HTTP, so it is an explicit exception rather than a
general policy change. Only the exact origin
`http://211.141.18.165:6195` is permitted. The provider transport still
requires a public resolved address, pins the validated address for the
connection, sends the correct `Host` header, disables proxy inheritance and
redirects, and applies response/timeout limits. Schema validation and the
runtime transport both reject bearer credentials on HTTP. Personal provider
profiles and MCP remain HTTPS-only. A first-party TLS reverse proxy is the
preferred long-term replacement for this exception.

The admin route `/manage/ai/models` evolves the existing provider CRUD UI. The
legacy `/manage/ai/providers` route redirects to it. The public AI composer uses
`model:<catalog-id>` for managed models and `profile:<profile-id>` for a user's
private provider profile, then maps them to distinct API request fields.

## Integration Adapter Contract

Adapters are installed and reviewed at build time. Runtime discovery is based
on a versioned public manifest:

```json
{
  "schema_version": "1",
  "adapter_id": "zhihu",
  "transport": "cli",
  "execution": "local_cli",
  "capabilities": [
    {
      "id": "content.search",
      "effect": "read",
      "required_fields": ["query"],
      "confirmation": "never"
    }
  ]
}
```

Each adapter owns its manifest and fixed argument builder. The registry checks
adapter and capability uniqueness, so adding a reviewed platform requires one
adapter module plus one registry entry; core command routing does not gain a
platform-specific conditional branch.

The first adapters cover:

- Feishu/Lark: authentication status, calendar agenda, text message send, and
  Markdown document creation through the official
  [Lark CLI](https://github.com/larksuite/cli).
- Zhihu: community/global search, hot list, Zhihu Direct Answer, and quota
  inspection through the official
  [Zhihu CLI](https://developer.zhihu.com/docs?key=zhihu_cli).

## Local CLI Safety Boundary

`sun-world integrations run` accepts structured JSON input, not raw argv. The
adapter constructs a fixed command and requires an absolute executable path.
Execution uses `shell: false`, a bounded allowlist of environment variables,
machine-readable JSON/NDJSON output, output/timeout limits, and process-group
termination. Preview output redacts user values.

Capabilities marked as write/delete are refused unless the caller supplies
`--dry-run` or `--confirm`. Credentials remain owned by the official CLI and
must not be supplied in command arguments, repository files, API requests, or
logs.

This local-only boundary is deliberate. If server-side scheduled execution is
added later, it must use a separate non-root worker with least-privilege
credentials, network egress controls, a durable command/event record, explicit
idempotency, and an `unknown` state for mutations whose upstream outcome cannot
be proven.

## External CLI Commands

```bash
sun-world ai models
sun-world ai ask --message "问题" [--model-id <catalog-id>]

sun-world integrations list
sun-world integrations inspect <adapter>
sun-world integrations doctor <adapter> --binary /absolute/path
sun-world integrations preview <adapter> <capability> \
  --binary /absolute/path --input-json '{...}'
sun-world integrations run <adapter> <capability> \
  --binary /absolute/path --input-json '{...}' [--dry-run|--confirm]
```

The default API is `https://api.sunworld.site`. Development and smoke tests can
select a local API with `--base-url` or `SUN_WORLD_API_BASE_URL`.
