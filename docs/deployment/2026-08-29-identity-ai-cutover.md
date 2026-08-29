# Optional Identity And AIGC Cutover

This runbook is required before deploying the 2026-08-29 optional identity and
personal AIGC implementation. Repository changes alone do not migrate the
database or provision any external account.

## 1. Prepare And Back Up

- Schedule a database maintenance window and take a tested backup/snapshot.
- Stop account-creation writes or put the API in maintenance mode while the
  username index is replaced.
- Add JWT/verification/encryption secrets, OAuth applications, SMTP/SMS
  delivery, narrow provider/MCP host allowlists, and upstream provider hard
  spending caps to the protected service environment. Never place values in
  the repository or command line.
- Keep credentialed CORS and cookie-write authority separate: CORS may retain
  the `zsf.shopping` compatibility origins, while
  `AUTH_CSRF_ALLOWED_ORIGINS` should contain only the primary, WWW, and API
  origins. Wildcard origins are rejected.
- Leave `AUTH_REFRESH_REUSE_GRACE_SECONDS=0` in production. The API rejects a
  non-zero value outside local runtime instead of weakening token-family reuse
  detection.

## 2. Preflight The Historical Username Index

The former contract allowed a non-unique `idx_users_username`; the new login
namespace requires that index to be unique. The general schema migrator will
fail closed on the old index and will never drop or rewrite it.

Run from the candidate API image with the same read-only configuration mounts
and protected environment used by deployment:

```bash
python -m src.database.mysql.username_index_migration --mode check
python -m src.database.mysql.username_index_migration --mode plan
```

Preflight reports only counts, never usernames. Resolve every unsupported or
contact-shaped historical username and every duplicate group under the active
MySQL collation. Re-run until `plan` prints exactly one expected atomic
`ALTER TABLE` or reports the migration already applied.

## 3. Apply In The Maintenance Window

After verifying the backup and accepting the table metadata/rebuild lock:

```bash
python -m src.database.mysql.username_index_migration \
  --mode apply \
  --acknowledge-locking
python -m src.database.mysql.schema_migration --mode apply
python -m src.database.mysql.schema_migration --mode validate
```

The index command validates after apply. Its plan output also prints the
explicit rollback statement; rollback weakens login integrity and must be used
only with an incident decision, never automatically.

## 4. Smoke Matrix

- `/auth/methods` accurately enables only configured methods.
- Guest home/blog/AIGC work without a session.
- Username, verified phone, verified email, Google, QQ, and WeChat login each
  set HttpOnly session cookies without tokens in URLs or JSON.
- OAuth login and explicit account connection remain distinct; connection
  requires recent authentication and the same session.
- Provider profiles, one persona, up to eight prompt-only skills, saved
  conversations, verified contacts, and account connections are user-scoped.
- One allowlisted MCP connection can discover and explicitly call a tool;
  changing its config invalidates the old catalog.
- Rate-limit, daily-budget, concurrency, timeout, and unavailable-provider
  paths fail with their documented safe errors.
- A cookie-authenticated mutation from `sunworld.site` succeeds, while the same
  request from a CORS-only compatibility domain or an untrusted origin fails
  CSRF validation.

Review security events and application logs without printing codes, contacts,
tokens, arguments, tool results, or credentials.
