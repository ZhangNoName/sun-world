# Security Hardening Plan

Date: 2026-06-01

This document tracks the first safety pass for the blog backend.
Do not store secrets, tokens, passwords, private keys, certificates, or full env values here.

## Completed In This Pass

- JWT signing secret is read from `BLOG_JWT_SECRET` or protected local config instead of being hardcoded in `AuthManager`.
- `start.sh` loads `/home/lighthouse/.config/blog_end/auth.env` when present.
- Backend now runs under `blog-api.service` using the project `.venv`.
- New password hashes use PBKDF2-SHA256 with per-password random salt.
- Legacy SHA-256 password hashes are still accepted for compatibility and are upgraded after successful login.
- Token verification no longer logs raw tokens.
- Config/database logs were reduced so password/token-like values are not printed.
- Blog creation now rolls back MySQL metadata if MongoDB content insertion fails.
- Blog tag lookup uses a parameterized `IN` query.
- Added `GET /healthz` for a simple process health check.

## Follow-Up Items

- Rotate `BLOG_JWT_SECRET` once the backend service/deploy path is finalized.
- Containerize the backend later if you want the same deployment shape as the frontend.
- Keep `.venv` out of Git; rebuild it from the dependency list or future lockfile when moving hosts.
- Add `/readyz` that checks database readiness without exposing details.
- Add rate limiting at Nginx or FastAPI middleware.
- Review cookie settings after the frontend/API domain policy is finalized.
- Add tests for auth hash compatibility and blog creation rollback.

## Operational Notes

- The secret file path is `/home/lighthouse/.config/blog_end/auth.env`.
- The file must be user-readable only, for example `chmod 600`.
- The file should contain `BLOG_JWT_SECRET=...`, but the value must never be copied into docs, logs, commits, or chat.
- Service controls:
  - `sudo systemctl status blog-api.service`
  - `sudo systemctl restart blog-api.service`
  - `sudo journalctl -u blog-api.service -n 100 --no-pager`
