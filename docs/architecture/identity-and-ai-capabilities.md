# Identity and Personal AI Capabilities

This document defines the security and ownership boundaries for optional
authentication, account association, personas, prompt-only skills, and MCP in
Sun World. The implementation is currently local and still requires schema
migration, provider credentials, and delivery configuration before production
cutover.

## Product Contract

- Browsing and temporary AIGC chat remain available without signing in.
- Signing in adds durable, user-owned data: conversations, provider profiles,
  personas, prompt-only skills, and MCP connections.
- A login method proves an identity; it does not grant permission to merge
  arbitrary accounts.
- Password registration accepts only a disjoint username plus password.
  Phone/email are added later through a purpose-bound verification flow;
  contact-shaped or unsupported Unicode usernames are rejected.
- External access tokens, refresh tokens, API keys, and MCP bearer tokens stay
  server-side. Browser responses expose only expiry metadata or masked hints.

## Supported Authentication Methods

| Method | Protocol | Account resolution |
|---|---|---|
| Password | Canonical username or canonical verified phone/email plus password | Existing active account only |
| Phone | Six-digit, one-time server challenge | Exact normalized verified phone |
| Email | Six-digit, one-time server challenge | Exact normalized verified email |
| Google | Authorization Code, PKCE, OIDC nonce and signed ID token | Provider subject, then provider-verified phone if present |
| QQ | Authorization Code | Provider subject, then provider-verified phone if present |
| WeChat | QR Authorization Code | Stable appid + OpenID identity; then provider-verified phone if present |

Google, QQ, and WeChat Web login profiles normally do not include a verified
phone number. In that common case there is no phone-based automatic match. A
user can first verify a phone/email on the site, or explicitly connect an OAuth
identity while already authenticated. The server never treats an unverified
provider value as an association key.

WeChat uses `(appid, openid)` as the stable primary subject because UnionID can
appear or change availability between responses. A historical UnionID-shaped
record is treated only as a migration alias: consolidation is transactional,
conflicts are audited, and two existing accounts are never silently merged.

## Automatic Account Resolution

Provider login runs one transaction and follows this order:

1. Find the unique `(provider, issuer, subject)` identity. If it exists, use
   its active account.
2. Otherwise, if the provider profile contains a phone value explicitly
   marked verified, normalize it and find the unique verified-phone record.
3. If neither exists, create a new account with an unusable random password and
   attach the new provider identity.

Verified provider email is retained as a verified contact, but is deliberately
not an automatic merge key. Nicknames, display names, avatars, unverified
claims, and legacy `users.phone` / `users.email` values are never automatic
merge keys. This fail-closed rule prevents account takeover through recycled,
spoofed, or historically unverified profile data.

If an incoming verified contact already belongs to a different account, the
server records a security event and does not move it. Unique indexes and
transactional retries close concurrent-link races. Explicit OAuth connection
starts from an authenticated session and binds the target `user_id` inside the
one-time server-side OAuth state; callback query parameters cannot choose the
target account. An identity or verified contact already owned by another user
causes a conflict instead of an automatic merge.

Explicit connection is a `flow=connect` operation, not an ordinary login. It
requires a recent authentication (600 seconds by default), binds both the user
and current session family into OAuth state, and rechecks that same active
session at callback. Contact connection uses a separate `connect` OTP purpose
bound to the same user and session. Neither flow can be converted to login by
changing callback query parameters.

## OAuth and Verification Security

- OAuth state, PKCE verifier, nonce, callback URI, return path, and optional
  explicit-connect target are stored in Redis for ten minutes and consumed
  exactly once.
- A path-only `return_to` prevents open redirects.
- Google ID tokens require RS256, the configured audience, an accepted issuer,
  matching nonce, and a subject matching UserInfo.
- OAuth state uses a path-scoped HttpOnly `SameSite=Lax` cookie so it survives
  the top-level provider callback without entering frontend JavaScript.
- Verification codes are random, HMAC-peppered, five-minute, one-time
  challenges. Redis atomically checks client/target cooldowns and IP,
  target-hour, target-day, and global quotas before reserving a delivery;
  rejected attempts do not burn target quota. Delivery failures roll back the
  owned target cooldown/hour/day reservation but retain the client cooldown and
  IP/global outbound-attempt budget. A wrong code consumes the challenge.
- Phone values use an E.164-shaped canonical form; mainland China mobile input
  without a country code is normalized to `+86`. Email is syntax-validated and
  lower-cased.
- Cookie-authenticated writes require a trusted `Origin` or `Referer` from the
  independent `AUTH_CSRF_ALLOWED_ORIGINS` list. CORS-only compatibility
  origins do not gain write authority; OAuth callbacks are GET requests with
  their own one-time state check.
- Access and refresh JWTs have distinct token types and identifiers. Redis is
  authoritative for active per-device tokens; refresh rotates the pair and
  logout revokes the device session. Refresh reuse is strict by default
  (`AUTH_REFRESH_REUSE_GRACE_SECONDS=0`), and non-zero grace is rejected
  outside local runtime; the device cookie is HttpOnly and never trusted as
  the sole token-binding source.
- Username/email/phone login uses one canonical value for both lookup and rate
  limiting, preventing collation or formatting variants from creating extra
  password-attempt budgets.

## Persistence

Identity data:

- `auth_identities`: unique provider issuer/subject mapped to one user.
- `auth_verified_contacts`: unique normalized phone/email mapped to one user.
- `auth_security_events`: link, login, conflict, and creation outcomes without
  raw credential values.

Opaque provider, issuer, subject, and normalized-contact columns use binary
collation. The conservative schema checker validates exact lengths,
nullability, defaults, `ON UPDATE`, collation, indexes, and foreign keys, and
blocks cutover if historical usernames violate the disjoint login namespace.

Personal AI data:

- `ai_personas`: one selected declarative role per run.
- `ai_skills`: reusable Markdown prompt instructions; `kind` is fixed to
  `prompt`.
- `ai_mcp_connections`: user-owned HTTPS endpoint and encrypted optional bearer
  token.
- `ai_mcp_tools`: last explicitly discovered, non-secret tool metadata.
- `ai_mcp_tool_calls`: call status, duration, argument key names, and result
  type/size only. It does not persist argument values or tool results.

Every query that returns or mutates personal data includes the authenticated
`user_id`. Cross-user lookups return not found rather than revealing ownership.

## Persona, Skill, and Prompt Precedence

A run may select one persona and at most eight skills. Both are declarative
preference text, bounded in length, and loaded only from the current user's
records. They are composed in this order:

1. platform safety instructions;
2. selected persona;
3. selected skills in request order;
4. stored conversation and current user message.

Skills cannot contain executable configuration, commands, scripts, imports,
or server-side files. `kind: prompt` is the only accepted kind. This is a
prompt-composition feature, not the repository-level Codex `SKILL.md` runtime.

## MCP Trust Boundary

The current MCP release is an explicit user-operated control plane. It does
not expose MCP tools to the model and does not autonomously call tools.

- Only HTTPS Streamable HTTP endpoints on port 443 are accepted; stdio is not
  supported. Endpoint query strings are rejected so credentials cannot be
  persisted or logged as part of the URL; use the encrypted bearer-token field.
- The server must configure `AI_MCP_ALLOWED_HOSTS`. With an empty allowlist,
  all MCP API operations fail closed with 503.
- The gateway canonicalizes hosts, supports explicit wildcard suffixes,
  resolves DNS before every operation, rejects the endpoint if any answer is
  non-public, pins a validated IP while preserving Host/TLS SNI, disables
  redirects and environment proxies, and bounds time and bytes.
- Bearer tokens use the same Fernet credential cipher as AI provider keys and
  are never returned after save.
- Tools must be explicitly discovered and stored before use. Every call body
  must include `confirmed: true`; the UI presents the exact tool and JSON
  arguments before sending it.
- Discovery metadata, argument payloads, output payloads, and pagination are
  bounded. Upstream failures map to stable safe error codes.
- Every connection has a monotonic revision. Endpoint, credential, or enabled
  changes invalidate its catalog; discovery binds tools to the current
  revision, and calls fail closed if the catalog is stale.
- User, IP, and global rate limits, a global distributed concurrency lease,
  and separate discovery/call deadlines bound resource usage.
- Call audit starts as `pending` before egress and ends as `succeeded`,
  `failed`, or `unknown`. An unknown outcome is not retried automatically,
  because the remote tool may already have performed a side effect.

## API Surface

Identity routes live under `/auth`: method discovery, verification request and
completion, OAuth start/callback, account connections, and authenticated
contact association. Personal AI routes live under `/ai/v1`: persona and skill
CRUD, run selection, plus MCP connection CRUD, discovery, tool listing, and
manual call.

All successful JSON endpoints use the shared `{ code, data, msg }` envelope.
OAuth callbacks redirect to the local frontend callback with status metadata;
they never put provider or Sun World tokens in the URL.

## Production Cutover Checklist

1. Generate stable `BLOG_JWT_SECRET`, `AUTH_VERIFICATION_PEPPER`, and
   `AI_CREDENTIAL_ENCRYPTION_KEY` values outside Git.
2. Configure only the OAuth applications enabled for the reviewed rollout and
   their exact callback URLs. Disabled Google/QQ/WeChat providers remain
   visible with an unavailable reason; the first production profile is
   QQ-only.
3. Configure SMTP and/or the HTTPS SMS adapter. An unconfigured channel remains
   disabled rather than pretending to send a code.
4. Set the smallest practical `AI_MCP_ALLOWED_HOSTS` list; never use a global
   wildcard.
5. Configure provider-account hard spending caps in addition to application
   request/token ceilings and daily Redis circuit breakers.
6. Run the versioned username-index preflight/migration, then the conservative
   MySQL schema check and apply; resolve historical username or exact-contract
   failures before cutover.
7. Restart the API, verify `/auth/methods`, login/callback/logout, account
   connections, guest AIGC, authenticated persona/skill persistence, and one
   allowlisted MCP discovery/call.
8. Review security events and service logs without printing tokens, codes, or
   full contact values.

No provider credential, database migration, deploy, or production account
mutation is performed merely by merging this implementation.
