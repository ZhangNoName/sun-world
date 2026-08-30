# Optional Identity And AIGC Cutover

This runbook is required before deploying the 2026-08-29 optional identity and
personal AIGC implementation. Repository changes alone do not migrate the
database or provision any external account.

## 1. Prepare And Back Up

- Schedule a database maintenance window and take a tested backup/snapshot.
- Never replace the username index while the legacy API can still write. The
  reviewed workflow preserves and stops the active `sun-world-api` container
  under a failure-restoring trap immediately before scoped apply; the typed
  maintenance acknowledgement explicitly accepts that downtime. The disabled
  `blog-api.service` is not used as rollback.
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

### Google production client

- Google Cloud project: `sun-world-507015`.
- Client type: Web application.
- Exact authorized redirect URI:
  `https://api.sunworld.site/auth/oauth/google/callback`.
- Requested scopes: `openid profile email`; no Gmail, Drive, Calendar, or other
  sensitive Google API scope is used.
- The current authorization-code flow is server-owned and does not depend on an
  authorized JavaScript origin. Keep `https://sunworld.site` registered; add
  `https://www.sunworld.site` before introducing any browser-side Google
  Identity Services flow.

The downloaded production client JSON has been validated locally and must stay
outside the repository. Before importing it, the Lighthouse checkout must
contain `deploy/backend/import_google_oauth_client.py`; follow that helper's
stdin-only command in `deploy/backend/README.md`. Do not print the JSON, expand
either value into a shell command, or copy the JSON itself to the server.

Before opening login to users, configure Google Auth Platform branding with the
Sun World homepage and the live `https://sunworld.site/privacy` URL, confirm
`sunworld.site` as the authorized domain, and review the Audience page. Use an
External audience; while the app is in Testing, add only explicit test users.
Publish only after the live domain, privacy page, and callback smoke test have
all been verified.

The production API host must also reach Google's four fixed HTTPS hosts. If a
direct route is unavailable, place a dedicated forward-proxy URL in the
protected service environment as `AUTH_GOOGLE_OUTBOUND_PROXY_URL`. The value is
sensitive because it may contain authority credentials. It must use `http` or
`https`, include an explicit host and port, and have no non-root path, query, or
fragment. Credentials are accepted only with `https`; an authenticated proxy
across a public or otherwise untrusted network must therefore use `https`.
Never print it, pass it on a command line, commit it, or expose it to the Web
app. Once configured, Google calls fail closed on proxy errors instead of
falling back to direct access; QQ, WeChat, AI, and MCP traffic remains unchanged.

The proxy must rate-limit clients and either authenticate them over HTTPS or
enforce the trusted-transport IP rule below. Allow `CONNECT` only to
`accounts.google.com:443`, `oauth2.googleapis.com:443`,
`openidconnect.googleapis.com:443`, and `www.googleapis.com:443`, and tunnel
TLS without decryption. Do not install a private proxy CA or disable certificate
verification. An unauthenticated `http` proxy is allowed only over a trusted
private network, WireGuard link, or operator-owned SSH tunnel and must enforce
an IP allowlist. Before database changes or API cutover, run the repository's
read-only probe from the reviewed candidate image exactly as described in
section 3. The probe prints only each fixed Google hostname and its HTTP status;
it never prints the proxy URL or response bodies. The public discovery and JWKS
targets must return HTTP `200`. The intentionally unauthenticated token and
userinfo requests are expected to return a non-proxy-authentication `4xx`, so
their status differs by design. Any connection/TLS/proxy failure, HTTP `407`,
or unexpected status fails the probe. Do not restart or cut over the
user-facing API until this exact container check passes.

## 2. Stage The Exact Reviewed SHA Without Deploying

The documented `sun-world-auto-deploy.timer` is a frontend-only daily deploy,
but it is external to GitHub Actions concurrency and can publish `origin/main`
at 03:30. Before exposing the reviewed commit on `main`, freeze `main`, verify
that `sun-world-auto-deploy.service` is inactive, and record the timer's exact
`is-enabled` and `is-active` results in the operator checklist. Then stop,
disable, and mask the timer:

```bash
sudo systemctl is-active sun-world-auto-deploy.service
sudo systemctl is-enabled sun-world-auto-deploy.timer
sudo systemctl is-active sun-world-auto-deploy.timer

sudo systemctl stop sun-world-auto-deploy.timer
sudo systemctl disable sun-world-auto-deploy.timer
sudo systemctl mask --runtime sun-world-auto-deploy.timer
sudo systemctl is-active sun-world-auto-deploy.timer
sudo systemctl is-enabled sun-world-auto-deploy.timer
```

Do not proceed unless the service and timer are inactive and the timer reports
`masked-runtime`. A runtime mask is preferred for this custom `/etc` unit's
one-time maintenance window because it does not leave a persistent mask symlink
after reboot; use a persistent mask only when it is separately approved. The
scoped workflow rechecks those states and holds the shared
`/tmp/sun-world-docker-build.lock` for the complete preflight, maintenance, API,
and optional frontend cutover. Stopping the timer before the push prevents the
reviewed frontend from being published ahead of its API.

After the implementation commit has been fully reviewed, record its exact
40-character lowercase commit SHA. Before pushing that commit, temporarily set
the GitHub Actions repository variable
`IDENTITY_CUTOVER_ALLOWED_SHA` to that exact SHA. Do not set it to a branch,
short SHA, uppercase value, or moving tag.

Push that one reviewed commit to `main` and wait for `Deploy Sun World` to
finish. The matching main/API push keeps `schema_mode=full` but forces
`deploy_needed=false`: quality checks and the API image build run, the
Lighthouse checkout advances to the reviewed SHA, and
`sun-world-api:<reviewed-sha>` is staged. The deploy job does not run, so this
step does not sync secrets, execute either schema apply, stop the API, or
switch a production container. Both server-side image builders reject staged,
unstaged, and non-ignored untracked files before and after selecting the exact
commit, so an untracked source shadow cannot enter an image bearing the
reviewed tag. A missing, malformed, or different repository
variable leaves ordinary push behavior unchanged: a normal API push retains
the strict full-schema deploy.

Do not depend on a full-schema failure to stage the image. If the safe staging
push needs a build retry after the commit is already on `main`, manually run
`Deploy Sun World` from `main` with `mode=build-only`, `target=api`, and
`schema_mode=full`; leave all three identity acknowledgement inputs empty. Verify
that the successful build metadata and local Lighthouse image both use the
same reviewed SHA. Do not push another commit while the temporary variable is
set or while the cutover is in progress.

Keep `IDENTITY_CUTOVER_ALLOWED_SHA` set to that same value through the final
`deploy-existing` run. Clear it immediately after a successful cutover. If the
cutover is abandoned, clear it immediately unless an approved retry will use
the exact same reviewed image.

## 3. Import Google And Preflight The Candidate Image

Only after the staging workflow succeeds does the Lighthouse checkout contain
the reviewed stdin-only importer. Stream the protected Google Web client JSON
using the fixed command in `deploy/backend/README.md`; never copy the JSON to
the server or expose either value on a command line.

Install the reviewed repository snippet as a fixed root-owned file. Do not
include the deploy-user-writable checkout directly from Nginx. These are future
production mutations and must run only in the authorized maintenance procedure:

```bash
sudo install -d -o root -g root -m 0755 /etc/nginx/snippets
sudo install -o root -g root -m 0644 \
  /home/lighthouse/blog/sun-world/deploy/backend/sun-world-oauth-callback-no-log.conf \
  /etc/nginx/snippets/sun-world-oauth-callback-no-log.conf
test "$(sudo stat -c '%U:%G:%a' /etc/nginx/snippets/sun-world-oauth-callback-no-log.conf)" = "root:root:644"
```

Use the configuration-file headers in `sudo nginx -T` to identify the
root-owned file containing the live `api.sunworld.site` HTTPS `server` block,
edit that file with `sudoedit`, and add this fixed include inside that block:

```nginx
include /etc/nginx/snippets/sun-world-oauth-callback-no-log.conf;
```

The snippet installs three exact Google, QQ, and WeChat callback locations that
disable both callback access-log and error-log persistence. The current
production configuration has only the generic location/default logs and is not
yet eligible for identity cutover. Validate, reload, and inspect the effective
configuration without sending a real authorization code through logs:

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo nginx -T 2>&1 |
  python3 /home/lighthouse/blog/sun-world/scripts/check-oauth-callback-log-safety.py --nginx-dump
```

The workflow repeats this live Nginx check before stopping the API or executing
DDL. The checker rejects server-level routing or another location that could
bypass the exact callback locations; it fails closed when include expansion or
virtual-host scope cannot be proved. The candidate API image starts Uvicorn
with access logging disabled.

No real Google authorization callback has been initiated in this rollout and
the feature is not live, but that is not sufficient evidence that historical
logs are clear. Before cutover, audit current, rotated, and compressed Nginx
access/error logs. The audit must print only each filename and its matching-line
count—never a matching line, query string, authorization code, or state value:

```bash
sudo python3 - <<'PY'
from __future__ import annotations

import gzip
import re
import sys
from pathlib import Path

log_root = Path("/var/log/nginx")
callback = re.compile(r"/auth/oauth/(google|qq|wechat)/callback\?")
audit_failed = False

try:
    log_paths = sorted(log_root.iterdir())
except OSError:
    print("nginx-log-audit:AUDIT_FAILED", file=sys.stderr)
    raise SystemExit(1)

for path in log_paths:
    if "access" not in path.name and "error" not in path.name:
        continue
    try:
        if not path.is_file():
            continue
        if path.suffix == ".gz":
            stream = gzip.open(path, "rt", encoding="utf-8", errors="replace")
        else:
            stream = path.open("rt", encoding="utf-8", errors="replace")
        with stream:
            count = sum(1 for line in stream if callback.search(line))
    except (OSError, EOFError):
        print(f"{path.name}:AUDIT_FAILED", file=sys.stderr)
        audit_failed = True
        continue
    print(f"{path.name}:{count}")
    if count > 0:
        audit_failed = True

raise SystemExit(1 if audit_failed else 0)
PY
```

Any nonzero count makes that log file sensitive even if the feature was not
expected to be live. Stop the rollout, record only the filename/count evidence,
and follow a user-approved retention plus safe rotation/deletion policy. Do not
print matching content and do not delete or truncate any log before approval.
The audit exits nonzero on any positive count or unreadable log/root directory;
do not override that result.
The real OAuth browser smoke in Section 5 may begin only after this historical
audit and the live no-log checker both pass.

Then run the scoped plan and Google outbound preflight from the exact staged
image. These commands do not apply DDL or start/replace the production API:

```bash
REVIEWED_SHA=<40-character-lowercase-reviewed-sha>
API_IMAGE="sun-world-api:$REVIEWED_SHA"

test "$(git -C /home/lighthouse/blog/sun-world rev-parse HEAD)" = "$REVIEWED_SHA"
git -C /home/lighthouse/blog/sun-world diff --quiet --
git -C /home/lighthouse/blog/sun-world diff --cached --quiet --
test -z "$(git -C /home/lighthouse/blog/sun-world status --porcelain --untracked-files=all)"
sudo docker image inspect "$API_IMAGE" >/dev/null

API_MOUNTS=(
  -v /home/lighthouse/.config/blog_end:/home/lighthouse/.config/blog_end:ro
  -v /data/blog:/data/blog
)
if [ -d /home/lighthouse/blog/blog_end/src/conf ]; then
  API_MOUNTS+=(
    -v /home/lighthouse/blog/blog_end/src/conf:/app/src/conf:ro
  )
fi
sudo docker run --rm --network host \
  -e BLOG_RUNTIME_ENV=production \
  "${API_MOUNTS[@]}" \
  "$API_IMAGE" /bin/sh -lc \
  'set -euo pipefail; set +x; set -a; . /home/lighthouse/.config/blog_end/auth.env; set +a; python -m src.modules.identity.redis_capability_preflight; python -m src.database.mysql.identity_schema_migration --mode plan; python -m src.modules.identity.google_outbound_preflight'
```

The schema plan is read-only and reports counts rather than usernames. The
Redis preflight executes only `INFO server`, prints no connection configuration,
and requires Redis 6.2 or newer for atomic `GETDEL`. Production was read-only
verified at Redis `7.0.15`, but every cutover still repeats this candidate-image
gate before DDL. The Google preflight first requires the protected client ID
and secret to make Google enabled in the provider registry. Because
`auth.env` is sourced inside the candidate command and may override Docker
environment values, the preflight also requires the resulting effective
`BLOG_RUNTIME_ENV` to remain exactly `production`; this prevents a cutover with
local cookie, CORS, or CSRF semantics. It also silently
requires the effective `AUTH_PUBLIC_API_ORIGIN=https://api.sunworld.site` and
`AUTH_PUBLIC_WEB_ORIGIN=https://sunworld.site`, preventing a green egress check
from hiding a callback `redirect_uri_mismatch`. It then prints only fixed
hostnames and HTTP status codes. Stop if the image, checkout, plan, Redis
capability, public origins, Google enablement, or outbound checks do not match
the reviewed expectation; do not proceed by changing the allowed SHA.

The clean-checkout assertions cover staged, unstaged, and non-ignored untracked
files. They intentionally ignore files covered by `.gitignore`, such as normal
build outputs, but reject an untracked Python module or modified checker that
could shadow the reviewed code while `HEAD` still matches the reviewed SHA.

## 4. Review And Apply The Scoped Identity Schema

The former contract allowed a non-unique `idx_users_username`; the new login
namespace requires that index to be unique. Production also needs the three
`auth_identities`, `auth_verified_contacts`, and `auth_security_events` tables.
The general schema migrator remains the strict full-application contract and
will never drop or rewrite the historical index.

The identity cutover has a separate allowlisted migration. Its static `check`
does not connect to MySQL; `plan` and `validate` connect read-only. It inspects
only `users.username`, `idx_users_username`, and the three identity tables, so
differences in roles, resources, blog, tag, and other legacy tables cannot
expand or block this scoped plan. It still fails closed on duplicate,
contact-shaped, or unsupported usernames and on an incompatible existing
identity table.

The static check remains available without database access:

```bash
python -m src.database.mysql.identity_schema_migration --mode check
```

Preflight reports only counts, never usernames. Resolve every unsupported or
contact-shaped historical username and every duplicate group under the active
MySQL collation. Review every printed statement. On the untouched legacy
schema, the maximum expected plan is one exact atomic username-index `ALTER
TABLE` plus three `CREATE TABLE IF NOT EXISTS` statements for the named
identity tables. Any other target is refused by the tool's exact SQL allowlist.

### Apply in the acknowledged maintenance window

After verifying the backup, accepting the table metadata/rebuild locks, and
reviewing the candidate plan, run `Deploy Sun World` manually from the
`main` branch with these inputs:

- `mode`: `deploy-existing`.
- `target`: `api` or `all`.
- `image_tag`: the exact value still present in
  `IDENTITY_CUTOVER_ALLOWED_SHA`.
- `schema_mode`: `identity-20260829`.
- `identity_schema_ack`: type `20260829_identity_schema` exactly.
- `identity_maintenance_ack`: type
  `STOP_CURRENT_API_FOR_IDENTITY_CUTOVER` exactly.
- `identity_timer_ack`: type
  `AUTO_DEPLOY_TIMER_STOPPED_FOR_IDENTITY_CUTOVER` exactly.

The detect gate rejects the scoped mode unless the workflow ref is exactly
`refs/heads/main`, `mode=deploy-existing`, the target includes API, the current
workflow commit SHA still equals the temporary 40-character lowercase
`IDENTITY_CUTOVER_ALLOWED_SHA`, `image_tag` equals that same SHA, and all three
typed acknowledgements match. This rejects a moved `main` instead of allowing a
new workflow revision to operate on an older reviewed image.

At the execution boundary the workflow rechecks the reviewed SHA, image tag,
acknowledgements, clean server checkout, timer mask, fixed callback-snippet
ownership/mode, live Nginx callback log safety, Redis capability, effective
production runtime, exact production public origins, Google registry
enablement, and outbound connectivity. This
one-time path supports the verified production topology only: `sun-world-api`
must exist and be running, no stale
`sun-world-api-identity-backup` may exist, and `blog-api.service` must remain
inactive and disabled. The Docker API must use host networking, restart policy
`unless-stopped`, and pass local port-8000 health. The current image must differ
from the reviewed target,
which blocks reapplying the same cutover image. The current container ID and
image are recorded, the container is renamed to
`sun-world-api-identity-backup`, and that preserved container is stopped only
after the exit/signal trap is armed. Renaming keeps its complete environment,
mounts, host network, port, restart policy, and old image configuration
available for recovery without printing them.

Any schema, candidate, or public API health failure removes the failed new
container, verifies the backup container ID/image, renames it back to
`sun-world-api`, starts it, and checks local health. It never starts the disabled
legacy systemd service. Candidate health is insufficient on its own: before
production replacement the workflow silently parses candidate `/auth/methods`
and requires `google.enabled=true`. After the new API passes public health it
repeats the same assertion through `https://api.sunworld.site/auth/methods`;
only then is the stopped API backup removed, with systemd still disabled. These
checks prove that the imported credentials reach both runtimes but do not prove
that Google's real authorization-code exchange succeeds.

With `target=all`, the frontend is left untouched until the scoped migration,
validate, candidate Google enablement/health, production API start, and public
API Google enablement/health have all succeeded; only then is the frontend
switched. The new container must pass direct local port-8081 health before the
two public-domain checks, so a cached or stale upstream response cannot release
the rollback trap. Its previous container is likewise preserved and restored
if the new frontend start, local health, or public health check fails. That
late frontend failure is a
deliberate partial success: the workflow reports failure and restores the old
frontend, while the already-healthy new API remains active. Retry only the Web
switch with `mode=deploy-existing`, `target=web`, the same reviewed image tag,
`schema_mode=full`, and all three identity acknowledgements empty. An API-only
scoped cutover skips the unrelated frontend-domain postcheck. This exact
manual Web-only path also preserves the current healthy `my-frontend` as
`my-frontend-identity-backup`, verifies its recorded ID/image before recovery,
and requires the replacement to pass both direct port-8081 and public-domain
health before deleting the backup. Do not use `build-and-deploy` or a full
`target=all` run as the Web retry.

The deploy job allows 60 minutes and holds the shared server-side `flock`
through preflight, maintenance, DDL, API recovery coverage, and any frontend
switch. SSH HUP, INT, and TERM are trapped and restore the recorded container.
SIGKILL, runner loss that cannot deliver a remote signal, or a host reboot is
not fully recoverable by an in-process shell trap. If workflow state becomes
uncertain, keep `main` frozen and the timer masked, inspect only the fixed
`sun-world-api`, `sun-world-api-identity-backup`, `sun-world-api-candidate`,
`my-frontend`, and `my-frontend-identity-backup` names, verify which recorded
image is running, then run the read-only scoped plan before any approved retry.

`apply` is refused before database access unless the exact migration ID is
passed from the manually typed input. The tool repeats the scoped plan and
allowlist validation after execution. It never drops tables or columns,
updates rows, or rewrites unrelated columns. MySQL DDL can commit statement by
statement; if an infrastructure failure interrupts the run, confirm that the
previous API container was restored and is healthy, inspect the fresh read-only
plan, and rerun the same idempotent workflow only after review.

This scoped path does not relax or replace
`src.database.mysql.schema_migration`. `schema_mode` defaults to `full`, and
push/PR runs cannot select the scoped option. The only push exception is the
exact-SHA staging rule above, which builds but cannot deploy; every other API
push keeps the full fail-closed deploy. Resolve unrelated legacy drift
separately before the next automatic deployment; never treat the one reviewed
identity cutover as a general schema bypass.

Only after the final scoped workflow has succeeded, or after an explicit abort
with no retry in progress, restore the timer to both recorded states. Do not
restore it after the staging build while import, preflight, or cutover remains.
For the recommended runtime mask, first run
`sudo systemctl unmask --runtime sun-world-auto-deploy.timer`. If the recorded
enabled state was `enabled`, run
`sudo systemctl enable sun-world-auto-deploy.timer`; if it was `disabled`, run
the corresponding `disable`; if a persistent mask was the recorded starting
state, restore that mask after all other state restoration. Then start the
timer only when its recorded active state was `active`; otherwise leave it
stopped. Re-run `is-enabled` and `is-active` and compare both outputs with the
checklist. Clear `IDENTITY_CUTOVER_ALLOWED_SHA` at the same finalization point.
For an approved retry, keep `main` frozen, retain the exact reviewed SHA, and
leave the timer stopped/masked until that retry ends. Never start
`sun-world-auto-deploy.service` manually during the cutover.

## 5. Smoke Matrix

- `/auth/methods` accurately enables only configured methods.
- A real browser starts Google login, returns through the exact production
  callback, creates a session, and reaches the signed-in page without placing
  an authorization code, state, or session token in Nginx/application logs.
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
