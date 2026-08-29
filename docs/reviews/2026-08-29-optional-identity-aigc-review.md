# Optional Identity And Personal AIGC Review

Date: 2026-08-29
Scope: local `main` working tree plus the newly created Google Cloud project and
production Web OAuth client; no production migration, server credential import,
deploy, or Sun World account mutation

## Verdict

The implementation has a coherent separation between identity, sessions,
personal AI persistence, provider egress, and the manually operated MCP control
plane. Public browsing and guest AI remain independent from authentication.
The final attack-oriented review found no remaining P0 or P1 issue in the
implemented scope.

This is integration-ready, but not production-cutover-ready until the migration,
secret, provider, allowlist, spending-cap, and smoke-test steps in
`docs/deployment/2026-08-29-identity-ai-cutover.md` are completed.

## Review Fixes Applied

- Credentialed CORS and CSRF write authority now use separate allowlists and
  reject wildcard origins. Compatibility origins do not implicitly gain cookie
  write authority.
- Production rejects a non-zero refresh-token reuse grace. A duplicated or
  stolen refresh token therefore revokes its session family by default.
- Fixed-provider OAuth HTTP clients ignore environment proxies, reject
  redirects, use separate connect/read/write/pool timeouts, and limit token,
  JWKS, and user-info response bytes before parsing. Google alone supports an
  explicitly configured, operator-controlled outbound proxy because the
  production host cannot currently reach Google's fixed endpoints directly.
- MCP endpoint URLs reject query strings, keeping credentials out of stored and
  logged URLs; encrypted bearer-token storage is the credential channel.
- Default user-provider replacement now locks the owner row and clears/writes
  the default inside one transaction.
- Editing an earlier user message explicitly removes feedback belonging to the
  truncated later messages in the same transaction.
- Route-specific gzip budgets were remeasured only for the expanded login,
  account, and QQ callback chunks. Repository-wide JS, CSS, entry, and largest-
  asset ceilings were not relaxed.

## Residual P2 And Product Follow-ups

These items do not invalidate the current manual, optional-login release, but
they should stay visible rather than being mistaken for completed capabilities.

1. Migrate production session cookies to host-only `__Host-` names, with an
   explicit legacy-cookie expiry plan, to further reduce subdomain cookie
   tossing/session swapping risk.
2. Before MCP tools are ever exposed to autonomous model execution, replace the
   reusable `confirmed: true` flag with a one-time ticket bound to user, session,
   connection revision, tool, and canonical arguments, and validate arguments
   against the discovered JSON Schema. The current release remains manual only.
3. Reconcile stale MCP `pending` audit rows to `unknown` after process crashes
   and define audit retention.
4. Add a client run idempotency key and persist an assistant placeholder before
   streaming. Today an uncommon final persistence failure can leave a response
   visible in the browser but absent from durable history.
5. Add broader foreign keys/cascades, or equivalent explicit transaction
   cleanup, for the remaining logical-only AI/auth relationships.
6. Complete the password-recovery product flow. The legacy reset endpoints
   intentionally still return `501`; password, OTP, and OAuth login themselves
   are implemented.
7. Extend OpenAPI with a distinct refresh-cookie scheme and shared error models
   for refresh/logout and common 401/403/429/503 responses.
8. Redis session validation and MySQL identity linking cannot form one atomic
   transaction. A logout that races the final connect write can still allow the
   already-authorized association to finish; the write remains bound to the
   same user and session ID. Treat this as a documented revocation race and
   consider a final session-version check/compensating workflow if stricter
   revocation semantics are required.

## Provider And Cost Boundaries

- Google, QQ, and ordinary WeChat Web profile responses generally do not carry
  a provider-verified phone number. Automatic association occurs only when an
  adapter actually receives that explicit assurance; otherwise the user logs in
  as the provider identity and associates a phone through Sun World's own OTP
  or uses the explicit recent-auth connection flow.
- Verified email is persisted but never used for automatic account merging.
- Application request/token budgets are circuit breakers, not billing limits.
  Provider-account hard spending caps remain a required operator control.

## Verification Evidence

- Attack-oriented auth/identity/CSRF/Redis/schema/AI/MCP review: 232 focused
  tests passed before the final hardening changes, with no P0/P1 finding.
- CORS/CSRF and production refresh-grace hardening: the API gate passed 331
  tests.
- Final focused OAuth hardening: 13 provider tests, 27 callback log-safety
  tests, and 8 Google credential-import tests passed.
- AI repository transaction follow-up and MCP endpoint validation have focused
  regression coverage.
- Final `corepack pnpm check`: all 19/19 repository gates passed, including 331
  API tests, 160 Web React tests, 38 shared UI tests, 14 AI UI tests, 39 AI
  composer tests, and 6 contract tests, plus typechecks, builds, SSG, UI
  boundaries, performance budgets, and static Compose validation.
- Desktop (1440x900) and mobile (390x844) browser QA passed for login,
  registration, and guest AIGC. The tested routes had no horizontal overflow
  or unexpected global error toast; guest role/skill and MCP controls surfaced
  the intended sign-in requirement.
