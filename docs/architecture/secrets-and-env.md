# Secrets and Environment Variables

环境变量与密钥管理规范。
Guidelines for managing secrets and environment variables.

## 原则 / Principles

- **绝不提交密钥** — `.env` 文件、密钥文件、证书私钥不得进入 Git。
- **使用 `.env.example`** — 每个需要环境变量的应用应提供仅有变量名和占位符的示例文件。
- **密钥集中存放** — 生产密钥存放在服务级别路径（如 `/home/lighthouse/.config/`），不混入仓库。
- **Never commit secrets** — `.env` files, key files, and certificate private keys must not enter Git.
- **Use `.env.example`** — Each app that needs env vars should provide an example file with variable names and placeholders only.
- **Centralize secrets** — Production secrets live at service-level paths (e.g., `/home/lighthouse/.config/`) and are not mixed into the repository.

## .gitignore 规则 / .gitignore Rules

Root `.gitignore`:

```
.env
.env.*
!.env.example
```

各子目录也有对应的 `.gitignore` 规则。
Subdirectories also have corresponding `.gitignore` rules.

## 前端 / Frontend (`apps/web`)

### 已处理的文件 / Processed Files

- `apps/web/.env` — 已从 Git 追踪中移除（保留本地文件）
- `apps/web/.env.development` — 已从 Git 追踪中移除
- `apps/web/.env.production` — 已从 Git 追踪中移除
- `apps/web/.env.example` — 已添加，包含变量名和占位符

- `apps/web/.env` — removed from Git tracking (local file kept)
- `apps/web/.env.development` — removed from Git tracking
- `apps/web/.env.production` — removed from Git tracking
- `apps/web/.env.example` — added with variable names and placeholders

### 变量参考 / Variable Reference

| 变量 / Variable | 用途 / Purpose | 敏感度 / Sensitivity |
|---|---|---|
| `VITE_BASE_URL` | API 基础路径 / API base path | 低 / Low |
| `VITE_APP_TITLE` | 应用标题 / App title | 低 / Low |
| `VITE_LANGCHAIN_*` | LangChain/LangSmith 配置 | 中 / Medium (API key) |

> **注意:** `VITE_LANGCHAIN_API_KEY` 在前端代码中是内置的，因此如果前端已编译并提交了密钥，即使移除 `.env` 文件也无法完全清除。构建产物（`dist/`）中可能仍包含这些值。如已泄露，应在 LangSmith 端轮换密钥。
> **Note:** `VITE_LANGCHAIN_API_KEY` is bundled into the frontend build. Removing `.env` files does not retroactively remove keys from committed history or build artifacts (`dist/`). If exposed, rotate the key on the LangSmith side.

Current rule: do not put LangSmith, LangChain, OpenAI, or other private API
keys in `VITE_*` variables. Vite bundles those values into browser JavaScript.
If a key has ever been committed or bundled, rotate or revoke it on the
provider side.

The AI workspace never reads provider credentials from `VITE_*`. Personal
provider keys are submitted once to the backend and are not cached in browser
storage.

## 后端 / Backend (`apps/api`)

### 当前状态 / Current State

- 后端 `.env` 文件未在仓库中追踪。
- 生产密钥文件位于 `/home/lighthouse/.config/blog_end/auth.env`。
- 密钥文件路径在 `blog-api.service` 的 `EnvironmentFile` 指令中指定。
- Backend `.env` files are not tracked in the repo.
- Production secrets live at `/home/lighthouse/.config/blog_end/auth.env`.
- The secret file path is specified in `blog-api.service` via `EnvironmentFile`.
- LangSmith tracing keys are server-side only. The API reads
  `LANGSMITH_API_KEY`, with `LANGCHAIN_API_KEY` as a compatibility fallback.
  Do not expose either value through `VITE_*`.
- `apps/api/.env.example` is a name-and-placeholder inventory only. It is safe
  to commit; a populated `.env` remains ignored.

### Authentication and identity variables

| Variable | Purpose | Required |
|---|---|---|
| `BLOG_JWT_SECRET` | Signs Sun World access and refresh JWTs | Yes |
| `BLOG_RUNTIME_ENV` | Authoritative `local` / `production` security mode; independent of generic framework `ENV` | Yes in production |
| `AUTH_VERIFICATION_PEPPER` | HMAC pepper for one-time email/SMS challenges | Yes before OTP login; falls back to JWT secret only for compatibility |
| `AUTH_PUBLIC_API_ORIGIN` | Exact public API origin used to construct OAuth callbacks | Yes outside the documented default domains |
| `AUTH_PUBLIC_WEB_ORIGIN` | Exact public frontend origin used as the post-OAuth destination | Yes outside the documented default domains |
| `BLOG_CORS_ORIGINS` | Comma-separated browser origins allowed to call the credentialed API; `*` is rejected | No; production/local defaults exist |
| `AUTH_CSRF_ALLOWED_ORIGINS` | Narrow comma-separated origins allowed to make cookie-authenticated writes; independent from CORS | No; defaults to the Sun World main/WWW/API origins plus local development origins in local mode |
| `AUTH_GOOGLE_CLIENT_ID` / `AUTH_GOOGLE_CLIENT_SECRET` | Google OIDC application | Both required to enable Google |
| `AUTH_GOOGLE_OUTBOUND_PROXY_URL` | Optional Google-only HTTP(S) forward proxy for token, JWKS, and userinfo calls | Required only where the API cannot reach Google directly |
| `AUTH_QQ_CLIENT_ID` / `AUTH_QQ_CLIENT_SECRET` | QQ Connect application | Both required to enable QQ |
| `AUTH_WECHAT_CLIENT_ID` / `AUTH_WECHAT_CLIENT_SECRET` | WeChat Open Platform application | Both required to enable WeChat |
| `AUTH_EMAIL_SMTP_HOST` / `AUTH_EMAIL_SMTP_PORT` / `AUTH_EMAIL_FROM` | SMTP delivery endpoint and sender | Host and sender required to enable email OTP |
| `AUTH_EMAIL_SMTP_USERNAME` / `AUTH_EMAIL_SMTP_PASSWORD` | Optional SMTP authentication | Provider-dependent |
| `AUTH_EMAIL_SMTP_STARTTLS` | Enables SMTP STARTTLS, default `true` | No |
| `AUTH_SMS_WEBHOOK_URL` / `AUTH_SMS_WEBHOOK_TOKEN` | Server-side HTTPS SMS adapter and optional bearer token | URL required to enable phone OTP |
| `AUTH_STEP_UP_MAX_AGE_SECONDS` | Recent-auth window for explicit identity/contact connection, default `600` | No |
| `AUTH_REFRESH_REUSE_GRACE_SECONDS` | Refresh duplicate grace; default `0`, and non-zero values are rejected outside local runtime | No |
| `AUTH_LOGIN_*`, `AUTH_REGISTER_*`, `AUTH_REFRESH_*`, `AUTH_OAUTH_*` | IP/identifier/provider/global request ceilings | No; bounded defaults exist |
| `AUTH_OTP_IP_HOURLY_LIMIT`, `AUTH_OTP_TARGET_HOURLY_LIMIT`, `AUTH_OTP_TARGET_DAILY_LIMIT`, `AUTH_OTP_GLOBAL_HOURLY_LIMIT` | Atomic OTP delivery quotas | No; bounded defaults exist |
| `MYSQL_CONNECT_TIMEOUT_SECONDS`, `MYSQL_READ_TIMEOUT_SECONDS`, `MYSQL_WRITE_TIMEOUT_SECONDS`, `REDIS_SOCKET_TIMEOUT_SECONDS` | Fail-closed backend I/O deadlines | No; defaults `3` / `5` / `5` / `2` |

OAuth client secrets, SMTP passwords, the SMS adapter token, JWT secret, and
verification pepper belong only in the protected service environment. The API
reports an unconfigured method as disabled; it must not ship placeholder
credentials or expose them through frontend variables.

`apps/api/.env.example` is an inventory and documented local template, not an
automatic loader. The root `corepack pnpm dev:api` launcher inherits the
calling shell, so explicitly source a Git-ignored local `.env` before starting
it. The standard local origins are `http://localhost:8030` for the API and
`http://localhost:3030` for the Web app. Google therefore requires the exact
local redirect URI
`http://localhost:8030/auth/oauth/google/callback`; production uses
`https://api.sunworld.site/auth/oauth/google/callback`. Provider registries are
created at API startup, so restart the API after changing OAuth credentials.
`AUTH_PUBLIC_API_ORIGIN` itself is only the scheme/host/optional-port origin;
the API appends `/auth/oauth/google/callback`. Google login uses an OAuth 2.0
Web application client rather than an API key, and is enabled only when both
`AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET` are present. Its current
`openid profile email` scope does not provide a verified phone, and verified
email is not an automatic account-merge key; users can explicitly attach a
phone through Sun World's OTP flow after login.

`AUTH_GOOGLE_OUTBOUND_PROXY_URL` is an explicit Google-only escape hatch for a
production API host that cannot reach Google's HTTPS services directly. It
accepts only an `http` or `https` URL with an explicit valid host and TCP port;
the path must be empty or `/`, and query/fragment/control characters are
rejected. Because production loads `auth.env` through a shell, the raw URL also
uses a strict shell-portable ASCII allowlist. Percent-encode credential
characters outside `A-Z`, `a-z`, `0-9`, `.`, `_`, `~`, and `-`; raw shell
metacharacters such as `$`, backticks, quotes, semicolons, `&`, and `#` are
rejected before provider startup. Authority credentials are allowed only with
an `https` proxy because
an `http` proxy would send `Proxy-Authorization` over a plaintext hop. Treat
the entire configured URL as a server-side secret even when the selected proxy
currently uses no credentials. An invalid non-empty value fails
provider-registry construction even when the Google client credentials are
absent. Missing client ID or client secret still leaves Google login disabled.

When set, only the Google token, signed-key, and userinfo requests use this
proxy. They retain fixed HTTPS destinations, normal public-CA certificate and
hostname verification, disabled redirects, bounded deadlines/bodies, and
`trust_env=False`; a proxy failure never falls back to a direct connection.
QQ, WeChat, AI providers, and MCP do not inherit the setting. The forward proxy
must rate-limit callers and either authenticate them over HTTPS or, only on the
trusted HTTP transports described below, enforce an IP allowlist. It must
permit `CONNECT` only to the four documented Google hostnames on port `443`
and pass TLS through without interception or a private/self-signed CA.

An unauthenticated `http` proxy is acceptable only across a trusted private
network, WireGuard link, or operator-owned SSH tunnel and must restrict clients
with an IP allowlist. Any authenticated proxy reachable across a public or
otherwise untrusted network must use `https`; never put credentials in an
`http` proxy URL.

Keep CORS compatibility separate from cookie-write authority. Production CORS
may retain `zsf.shopping` and `www.zsf.shopping` for read compatibility, while
the default/deployed CSRF list contains only `sunworld.site`,
`www.sunworld.site`, and `api.sunworld.site`. Never use `*` in either origin
variable. Production also fails startup if refresh-token reuse grace is not
strictly `0`; non-zero grace is reserved for deliberate local concurrency
testing.

### AI provider variables

| Variable | Purpose | Required |
|---|---|---|
| `DEEPSEEK_API_KEY` | Default DeepSeek credential | No; first default choice |
| `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL` | DeepSeek endpoint/model override | No |
| `OPENROUTER_API_KEY` | Default OpenRouter credential when DeepSeek is absent | No |
| `OPENROUTER_BASE_URL` / `OPENROUTER_MODEL` | OpenRouter endpoint/model override | No |
| `OPENAI_API_KEY` | Default OpenAI credential when earlier choices are absent | No |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` | OpenAI endpoint/model override | No |
| `AI_URL` / `AI_CHAT_MODEL` | Legacy compatible endpoint/model fallback | No |
| `AI_CREDENTIAL_ENCRYPTION_KEY` | Fernet key used to encrypt per-user provider keys in MySQL | Required before personal keys can be saved |
| `AI_PROVIDER_ALLOWED_HOSTS` | Exact hosts or explicit `*.suffix` rules for built-in and user AI provider endpoints | Required to run AI; empty fails closed |
| `AI_PROVIDER_MAX_OUTPUT_TOKENS` | Maximum output tokens sent to compatible providers (default `4096`, max `16384`) | No |
| `AI_GUEST_RUN_RATE_LIMIT` / `AI_AUTHENTICATED_RUN_RATE_LIMIT` | Per-window AI run ceilings for guest IPs and signed-in accounts | No; defaults `20` / `60` |
| `AI_GLOBAL_RUN_RATE_LIMIT` / `AI_RUN_RATE_WINDOW_SECONDS` | Site short-window ceiling and window, defaults `200` / `600` seconds | No |
| `AI_GUEST_DAILY_RUN_LIMIT` / `AI_AUTHENTICATED_DAILY_RUN_LIMIT` | Per-principal 24-hour run budgets, defaults `50` / `300` | No |
| `AI_GUEST_GLOBAL_DAILY_RUN_LIMIT` / `AI_GLOBAL_DAILY_RUN_LIMIT` | Distributed-guest and whole-site 24-hour circuit breakers, defaults `500` / `2000` | No |
| `AI_GLOBAL_RUN_CONCURRENCY` / `AI_RUN_CONCURRENCY_TTL_SECONDS` | Distributed provider-run slots and lease TTL, defaults `8` / `240` | No |
| `AI_MCP_ALLOWED_HOSTS` | Comma-separated exact hosts or explicit `*.suffix` rules for user MCP endpoints | Required to enable MCP; empty disables all MCP APIs |
| `AI_MCP_RATE_WINDOW_SECONDS`, `AI_MCP_USER_RATE_LIMIT`, `AI_MCP_IP_RATE_LIMIT`, `AI_MCP_GLOBAL_RATE_LIMIT` | Independent MCP user/IP/global request budgets | No; bounded defaults exist |
| `AI_MCP_GLOBAL_CONCURRENCY` / `AI_MCP_CONCURRENCY_TTL_SECONDS` | Distributed MCP operation slots and lease TTL | No; defaults `8` / `120` |
| `AI_MCP_DISCOVERY_DEADLINE_SECONDS` / `AI_MCP_CALL_DEADLINE_SECONDS` | End-to-end MCP deadlines | No; defaults `30` / `60` |

Generate `AI_CREDENTIAL_ENCRYPTION_KEY` outside the repository with a secure
Fernet-compatible generator, store it in the protected service environment,
and keep it stable across deployments. Rotating it requires an explicit
credential migration or users must save their provider keys again. API profile
responses contain only a boolean and masked suffix, never ciphertext or
plaintext.

The same Fernet key encrypts optional per-user MCP bearer tokens. MCP API
responses expose only `has_bearer_token` and a masked suffix. Keep the MCP host
allowlist narrow; it is policy rather than a secret, but changing it expands
which external systems authenticated users may contact through the API.

AI provider traffic is also fail-closed unless its hostname matches
`AI_PROVIDER_ALLOWED_HOSTS`. Production should list only actual catalog hosts
(for example `api.deepseek.com`) and explicitly approved custom-provider
suffixes. Calls use fresh public-address DNS validation, IP pinning with the
original TLS SNI/Host, no redirects or environment proxy, and bounded time,
response bytes, emitted characters, output tokens, and request rate.
The Redis 24-hour budgets are abuse circuit breakers, not financial ledgers.
Set a hard spending cap and alerts in every upstream provider account before
enabling anonymous AIGC in production.

Production stores `AI_CREDENTIAL_ENCRYPTION_KEY` and `DEEPSEEK_API_KEY` as
GitHub Actions repository secrets. When an API deployment runs, the workflow
sends both values over the existing SSH channel through standard input and
`deploy/backend/sync_ai_secrets.py` atomically updates only those entries in
`/home/lighthouse/.config/blog_end/auth.env`. The helper preserves every other
server-side variable, writes mode `0600`, and never prints secret values.

The OAuth, OTP, and MCP variables are not automatically provisioned by the
AI secret synchronization workflow. Production operators must add them to the
protected service environment, and should update deployment secret automation
explicitly before enabling the corresponding method. A downloaded Google Web
client can be streamed from the operator machine to
`deploy/backend/import_google_oauth_client.py`; the JSON stays on standard
input, must belong to project `sun-world-507015`, and the helper atomically
updates only the two Google variables under a shared lock. See
`deploy/backend/README.md` for the no-echo import and rollback commands. Never
work around this by committing a populated configuration file.

### 切换后 / After Cutover

切换到 monorepo 路径后，密钥文件路径不变，以减小变更范围。
After cutting over to the monorepo path, the secret file path remains unchanged to minimize churn.

## 安全扫描 / Security Scanning

运行文件名扫描以检查可疑模式（仅报告文件路径，不打印内容）：
Run filename-level scans for sensitive patterns (report file paths only, never content):

```bash
git grep -IlE 'sk-[A-Za-z0-9]|password:|password=|token:|token=|secret:|secret=|api[_-]?key|BEGIN .*KEY' -- . ':!pnpm-lock.yaml' ':!poetry.lock' ':!**/dist/**' || true
```

Frontend client bundle guard:

```bash
node scripts/check-web-client-secrets.mjs
```

## 已知注意事项 / Known Notes

- `apps/api/src/conf/local.yml` 可能包含服务配置，不在本阶段处理。
- 证书文件（`sunworld.site.*`）已在 `.gitignore` 中排除。
- `apps/api/src/conf/local.yml` may contain service configuration — out of scope for this phase.
- Certificate files (`sunworld.site.*`) are already excluded in `.gitignore`.
