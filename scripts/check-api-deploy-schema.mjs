#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workflowPath = join(repoRoot, '.github', 'workflows', 'deploy.yml')
const migrationPath = join(
  repoRoot,
  'apps',
  'api',
  'src',
  'database',
  'mysql',
  'schema_migration.py'
)
const identityMigrationPath = join(
  repoRoot,
  'apps',
  'api',
  'src',
  'database',
  'mysql',
  'identity_schema_migration.py'
)
const identityMigrationTestPath = join(
  repoRoot,
  'apps',
  'api',
  'tests',
  'test_identity_schema_migration.py'
)
const redisCutoverPreflightPath = join(
  repoRoot,
  'apps',
  'api',
  'src',
  'modules',
  'identity',
  'redis_capability_preflight.py'
)
const redisCutoverPreflightTestPath = join(
  repoRoot,
  'apps',
  'api',
  'tests',
  'test_identity_redis_preflight.py'
)
const googleOutboundPreflightPath = join(
  repoRoot,
  'apps',
  'api',
  'src',
  'modules',
  'identity',
  'google_outbound_preflight.py'
)
const googleOutboundPreflightTestPath = join(
  repoRoot,
  'apps',
  'api',
  'tests',
  'test_google_outbound_preflight.py'
)
const identityCutoverGatePath = join(
  repoRoot,
  'scripts',
  'identity-cutover-gate.mjs'
)
const runApiCheckPath = join(repoRoot, 'scripts', 'run-api-check.mjs')
const backendDocPath = join(repoRoot, 'deploy', 'backend', 'README.md')
const cutoverRunbookPath = join(
  repoRoot,
  'docs',
  'deployment',
  '2026-08-29-identity-ai-cutover.md'
)
const packageJsonPath = join(repoRoot, 'package.json')
const violations = []

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1
}

const workflow = readIfExists(workflowPath)
const migration = readIfExists(migrationPath)
const identityMigration = readIfExists(identityMigrationPath)
const redisCutoverPreflight = readIfExists(redisCutoverPreflightPath)
const googleOutboundPreflight = readIfExists(googleOutboundPreflightPath)
const identityCutoverGate = readIfExists(identityCutoverGatePath)
const runApiCheck = readIfExists(runApiCheckPath)
const backendDoc = readIfExists(backendDocPath)
const cutoverRunbook = readIfExists(cutoverRunbookPath)
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

if (!workflow) {
  violations.push('.github/workflows/deploy.yml must exist')
}

if (!migration) {
  violations.push('apps/api/src/database/mysql/schema_migration.py must exist')
}

if (!identityMigration) {
  violations.push(
    'apps/api/src/database/mysql/identity_schema_migration.py must exist'
  )
}

if (!existsSync(identityMigrationTestPath)) {
  violations.push(
    'apps/api/tests/test_identity_schema_migration.py must protect the scoped migration'
  )
}

if (!redisCutoverPreflight) {
  violations.push(
    'apps/api/src/modules/identity/redis_capability_preflight.py must protect the Redis GETDEL requirement'
  )
}

if (!existsSync(redisCutoverPreflightTestPath)) {
  violations.push(
    'apps/api/tests/test_identity_redis_preflight.py must test the Redis version gate'
  )
}

if (!googleOutboundPreflight) {
  violations.push(
    'apps/api/src/modules/identity/google_outbound_preflight.py must protect Google credential enablement and egress'
  )
}

if (!existsSync(googleOutboundPreflightTestPath)) {
  violations.push(
    'apps/api/tests/test_google_outbound_preflight.py must test the Google preflight gate'
  )
}

if (!identityCutoverGate) {
  violations.push(
    'scripts/identity-cutover-gate.mjs must centralize the reviewed-image and acknowledgement policy'
  )
}

if (workflow) {
  const requiredFragments = [
    'API_IMAGE_NAME: sun-world-api',
    'api_changed:',
    'schema_mode:',
    'default: full',
    'identity-20260829',
    'identity_schema_ack:',
    'identity_maintenance_ack:',
    'identity_timer_ack:',
    'cancel-in-progress: false',
    'schema_mode: ${{ steps.detect.outputs.schema_mode }}',
    'IDENTITY_CUTOVER_ALLOWED_SHA: ${{ vars.IDENTITY_CUTOVER_ALLOWED_SHA }}',
    'DISPATCH_IMAGE_TAG: ${{ inputs.image_tag }}',
    'IDENTITY_SCHEMA_ACK: ${{ inputs.identity_schema_ack }}',
    'IDENTITY_MAINTENANCE_ACK: ${{ inputs.identity_maintenance_ack }}',
    'IDENTITY_TIMER_ACK: ${{ inputs.identity_timer_ack }}',
    'IDENTITY_CUTOVER_ALLOWED_SHA=""',
    'IDENTITY_SCHEMA_ACK=""',
    'IDENTITY_MAINTENANCE_ACK=""',
    'IDENTITY_TIMER_ACK=""',
    'Scoped identity authorization changed after detect; refusing SSH.',
    'node scripts/identity-cutover-gate.mjs validate',
    'node scripts/identity-cutover-gate.mjs should-stage-push',
    'node scripts/identity-cutover-gate.mjs validate-image-tag "$image_tag"',
    '"$GITHUB_REF"',
    '"$GITHUB_SHA"',
    'Reviewed identity cutover SHA will be built without an automatic production deploy.',
    'build-api:',
    'Build API image on Lighthouse',
    'deploy_image="${API_IMAGE_NAME}:${{ needs.detect-changes.outputs.image_tag }}"',
    'api-deploy-metadata-${{ needs.detect-changes.outputs.image_tag }}',
    'API_CHANGED: ${{ needs.detect-changes.outputs.api_changed }}',
    'API_IMAGE: ${{ env.API_IMAGE_NAME }}:${{ needs.detect-changes.outputs.image_tag }}',
    'SCHEMA_MODE: ${{ needs.detect-changes.outputs.schema_mode }}',
    'DEPLOYMENT_MODE: ${{ inputs.mode }}',
    'timeout-minutes: 60',
    'IMAGE_TAG: ${{ needs.detect-changes.outputs.image_tag }}',
    'if ! [[ "$IDENTITY_CUTOVER_ALLOWED_SHA" =~ ^[0-9a-f]{40}$ ]]; then',
    'if [ "$DEPLOYMENT_MODE" != "deploy-existing" ]; then',
    'if [ "$IDENTITY_CUTOVER_ALLOWED_SHA" != "$IMAGE_TAG" ]; then',
    'if [ "$server_checkout_sha" != "$IMAGE_TAG" ]; then',
    'if [ "$API_IMAGE" != "sun-world-api:$IMAGE_TAG" ]; then',
    'if [ "$IDENTITY_SCHEMA_ACK" != "20260829_identity_schema" ]; then',
    'if [ "$IDENTITY_MAINTENANCE_ACK" != "STOP_CURRENT_API_FOR_IDENTITY_CUTOVER" ]; then',
    'if [ "$IDENTITY_TIMER_ACK" != "AUTO_DEPLOY_TIMER_STOPPED_FOR_IDENTITY_CUTOVER" ]; then',
    'sun-world-auto-deploy.timer',
    'sun-world-auto-deploy.service',
    'timer_enabled_state=',
    '"masked-runtime"',
    'LOCK_FILE="/tmp/sun-world-docker-build.lock"',
    'flock 9',
    'sudo nginx -T 2>&1 |',
    'scripts/check-oauth-callback-log-safety.py --nginx-dump',
    'python -m src.modules.identity.redis_capability_preflight',
    'python -m src.database.mysql.identity_schema_migration --mode plan',
    'python -m src.modules.identity.google_outbound_preflight',
    '-e BLOG_RUNTIME_ENV=production',
    'check_google_auth_method',
    'item.get("id") == "google" and item.get("enabled") is True',
    'http://127.0.0.1:18000/auth/methods',
    'https://api.sunworld.site/auth/methods',
    'Candidate API does not report Google login as enabled.',
    'Public API does not report Google login as enabled.',
    'trap identity_exit_trap EXIT',
    'elif [ "$status" -ne 0 ] && sudo docker container inspect sun-world-api-identity-backup',
    'PREVIOUS_API_CONTAINER_ID=',
    'PREVIOUS_API_IMAGE=',
    'if [ "$PREVIOUS_API_IMAGE" = "$API_IMAGE" ]; then',
    'Scoped identity cutover requires the current API container to be running.',
    '{{.HostConfig.NetworkMode}}',
    '{{.HostConfig.RestartPolicy.Name}}',
    'Scoped identity cutover requires the current API container to pass local port-8000 health.',
    'Scoped identity cutover requires the legacy systemd API to remain inactive and disabled.',
    'sudo docker rename sun-world-api sun-world-api-identity-backup',
    'sudo docker stop sun-world-api-identity-backup',
    'sudo docker rename sun-world-api-identity-backup sun-world-api',
    'sudo docker start sun-world-api',
    'sudo systemctl disable blog-api.service',
    'restore_identity_api',
    'Deferring frontend cutover until the scoped API cutover is healthy.',
    'No frontend post-deploy health check needed for API-only scoped cutover.',
    'LEGACY_FRONTEND_CONTAINER_ID=',
    'LEGACY_FRONTEND_IMAGE=',
    'restore_identity_frontend',
    'trap identity_frontend_exit_trap EXIT',
    'elif [ "$status" -ne 0 ] && sudo docker container inspect my-frontend-identity-backup',
    'sudo docker rename my-frontend my-frontend-identity-backup',
    'sudo docker rename my-frontend-identity-backup my-frontend',
    'Previous frontend container was restarted but did not pass local health.',
    'New frontend container failed local port-8081 health.',
    'if [ "$API_CHANGED" = "true" ]; then',
    'sudo docker image inspect "$API_IMAGE"',
    'API_MOUNTS=(',
    '/home/lighthouse/.config/blog_end:/home/lighthouse/.config/blog_end:ro',
    '/home/lighthouse/blog/blog_end/src/conf:/app/src/conf:ro',
    'python -m src.database.mysql.schema_migration --mode apply',
    'python -m src.database.mysql.identity_schema_migration --mode apply --acknowledge "$1"',
    'python -m src.database.mysql.identity_schema_migration --mode validate',
    'identity-migration "$IDENTITY_SCHEMA_ACK"',
    'sudo docker run --rm --network host',
    'sun-world-api-candidate',
    'sudo docker run -d --name sun-world-api-candidate --network host',
    '-e BLOG_PORT=18000',
    'curl -fsS http://127.0.0.1:18000/healthz',
    'sudo docker inspect --format',
    'sudo docker logs --tail 120 sun-world-api-candidate',
    'sudo systemctl stop blog-api.service',
    'sudo systemctl disable blog-api.service',
    'sudo docker run -d --restart unless-stopped --name sun-world-api --network host',
    '-e BLOG_PORT=8000',
    'API_READY=false',
    'curl -fsS http://127.0.0.1:8000/healthz',
    'sudo docker logs --tail 120 sun-world-api',
    'sudo systemctl enable blog-api.service',
    'sudo systemctl start blog-api.service',
    'https://api.sunworld.site/healthz',
    '. /home/lighthouse/.config/blog_end/auth.env',
  ]

  for (const fragment of requiredFragments) {
    if (!workflow.includes(fragment)) {
      violations.push(
        `deploy workflow must contain API deploy fragment: ${fragment}`
      )
    }
  }

  const apiBuildBlock =
    workflow.match(
      /- name: Build API image on Lighthouse[\s\S]*?\r?\n\s+REMOTE/
    )?.[0] ?? ''
  if (
    countOccurrences(
      apiBuildBlock,
      'git status --porcelain --untracked-files=all'
    ) < 2 ||
    countOccurrences(apiBuildBlock, 'git diff --quiet --') < 2 ||
    countOccurrences(apiBuildBlock, 'git diff --cached --quiet --') < 2 ||
    apiBuildBlock.includes('git status --short')
  ) {
    violations.push(
      'API image build must reject staged, unstaged, and untracked dirty checkout cases before and after selecting the reviewed SHA'
    )
  }
  const apiBuildEnv =
    apiBuildBlock.match(
      /- name: Build API image on Lighthouse\r?\n\s+env:[\s\S]*?\r?\n\s+shell:/
    )?.[0] ?? ''
  if (countOccurrences(apiBuildEnv, 'LIGHTHOUSE_HOST:') !== 1) {
    violations.push(
      'the API image build step must declare LIGHTHOUSE_HOST exactly once'
    )
  }
  if (
    /\r?\n\s+fi\r?\n\s+fi\r?\n\s+if ! sudo docker container inspect sun-world-api/.test(
      workflow
    )
  ) {
    violations.push(
      'scoped API container preflight must not contain a duplicate fi terminator'
    )
  }

  for (const endpoint of [
    'http://127.0.0.1:18000/auth/methods',
    'https://api.sunworld.site/auth/methods',
  ]) {
    if (countOccurrences(workflow, endpoint) !== 1) {
      violations.push(
        `scoped Google enablement endpoint must be checked exactly once: ${endpoint}`
      )
    }
  }

  if (
    !/schema_mode:\r?\n\s+description: API schema migration scope\r?\n\s+required: true\r?\n\s+default: full\r?\n\s+type: choice\r?\n\s+options:\r?\n\s+- full\r?\n\s+- identity-20260829/.test(
      workflow
    )
  ) {
    violations.push(
      'manual schema mode must default to full and expose only the reviewed identity scope'
    )
  }

  const fullMigrationCommand =
    'python -m src.database.mysql.schema_migration --mode apply'
  const identityApplyCommand =
    'python -m src.database.mysql.identity_schema_migration --mode apply --acknowledge "$1"'
  const identityValidateCommand =
    'python -m src.database.mysql.identity_schema_migration --mode validate'
  for (const command of [
    fullMigrationCommand,
    identityApplyCommand,
    identityValidateCommand,
  ]) {
    if (countOccurrences(workflow, command) !== 1) {
      violations.push(
        `API deploy workflow must contain exactly one guarded command: ${command}`
      )
    }
  }

  const schemaExecutionCases = [
    ...workflow.matchAll(/case "\$SCHEMA_MODE" in([\s\S]*?)\r?\n\s+esac/g),
  ]
  const schemaExecution =
    schemaExecutionCases.find((match) =>
      match[1].includes(fullMigrationCommand)
    )?.[1] ?? ''
  const fullBranch = schemaExecution.match(/full\)([\s\S]*?);;/)?.[1] ?? ''
  const identityBranch =
    schemaExecution.match(/identity-20260829\)([\s\S]*?);;/)?.[1] ?? ''
  if (!fullBranch.includes(fullMigrationCommand)) {
    violations.push(
      'automatic/full API deploys must retain the strict schema apply'
    )
  }
  if (
    !identityBranch.includes(identityApplyCommand) ||
    !identityBranch.includes(identityValidateCommand) ||
    identityBranch.includes(fullMigrationCommand)
  ) {
    violations.push(
      'identity API deploys must run only scoped apply plus post-apply validate'
    )
  }

  if (
    workflow.includes(
      'identity_schema_migration --mode apply --acknowledge 20260829_identity_schema'
    )
  ) {
    violations.push(
      'identity schema apply must use the exact manually entered acknowledgement rather than a hard-coded workflow acknowledgement'
    )
  }

  const remoteDeploy =
    workflow.match(
      /- name: Deploy local images on Lighthouse[\s\S]*?\r?\n\s+REMOTE/
    )?.[0] ?? ''
  const currentApiStopIndex = remoteDeploy.indexOf(
    'sudo docker stop sun-world-api-identity-backup'
  )
  const currentApiRenameIndex = remoteDeploy.indexOf(
    'sudo docker rename sun-world-api sun-world-api-identity-backup'
  )
  const serverCheckoutCheckIndex = remoteDeploy.indexOf(
    'if [ "$server_checkout_sha" != "$IMAGE_TAG" ]; then'
  )
  const checkoutUnstagedCheckIndex = remoteDeploy.indexOf(
    'git -C /home/lighthouse/blog/sun-world diff --quiet --'
  )
  const checkoutStagedCheckIndex = remoteDeploy.indexOf(
    'git -C /home/lighthouse/blog/sun-world diff --cached --quiet --'
  )
  const checkoutUntrackedCheckIndex = remoteDeploy.indexOf(
    'git -C /home/lighthouse/blog/sun-world status --porcelain --untracked-files=all'
  )
  const apiRollbackActivationIndex = remoteDeploy.indexOf(
    'IDENTITY_MAINTENANCE_ACTIVE=true'
  )
  const callbackSnippetMetadataIndex = remoteDeploy.indexOf(
    "sudo stat -c '%U:%G:%a' /etc/nginx/snippets/sun-world-oauth-callback-no-log.conf"
  )
  const nginxLogSafetyIndex = remoteDeploy.indexOf('sudo nginx -T 2>&1 |')
  const redisPreflightIndex = remoteDeploy.indexOf(
    'python -m src.modules.identity.redis_capability_preflight'
  )
  const scopedPlanIndex = remoteDeploy.indexOf(
    'python -m src.database.mysql.identity_schema_migration --mode plan'
  )
  const googlePreflightIndex = remoteDeploy.indexOf(
    'python -m src.modules.identity.google_outbound_preflight'
  )
  const scopedPreflightRunIndex = remoteDeploy.lastIndexOf(
    'sudo docker run --rm --network host',
    googlePreflightIndex
  )
  const scopedPreflightRuntimeIndex = remoteDeploy.lastIndexOf(
    '-e BLOG_RUNTIME_ENV=production',
    googlePreflightIndex
  )
  const identityApplyIndex = remoteDeploy.indexOf(identityApplyCommand)
  const publicApiHealthIndex = remoteDeploy.indexOf(
    'curl -fsS https://api.sunworld.site/healthz'
  )
  const candidateGoogleMethodIndex = remoteDeploy.indexOf(
    'http://127.0.0.1:18000/auth/methods'
  )
  const productionApiStartIndex = remoteDeploy.indexOf(
    'sudo docker run -d --restart unless-stopped --name sun-world-api --network host'
  )
  const publicGoogleMethodIndex = remoteDeploy.indexOf(
    'https://api.sunworld.site/auth/methods'
  )
  const maintenanceCompleteIndex = remoteDeploy.lastIndexOf(
    'IDENTITY_MAINTENANCE_ACTIVE=false'
  )
  const deferredFrontendIndex = remoteDeploy.lastIndexOf(
    'sudo docker rename my-frontend my-frontend-identity-backup'
  )
  const frontendLocalHealthIndex = remoteDeploy.lastIndexOf(
    'curl -fsSI http://127.0.0.1:8081'
  )
  const frontendPublicHealthIndex = remoteDeploy.lastIndexOf(
    'curl -fsSI https://sunworld.site'
  )
  if (
    currentApiStopIndex < 0 ||
    serverCheckoutCheckIndex < 0 ||
    checkoutUnstagedCheckIndex < serverCheckoutCheckIndex ||
    checkoutStagedCheckIndex < checkoutUnstagedCheckIndex ||
    checkoutUntrackedCheckIndex < checkoutStagedCheckIndex ||
    callbackSnippetMetadataIndex < checkoutUntrackedCheckIndex ||
    nginxLogSafetyIndex < 0 ||
    nginxLogSafetyIndex < callbackSnippetMetadataIndex ||
    redisPreflightIndex < nginxLogSafetyIndex ||
    scopedPlanIndex < redisPreflightIndex ||
    googlePreflightIndex < scopedPlanIndex ||
    scopedPreflightRunIndex < nginxLogSafetyIndex ||
    scopedPreflightRuntimeIndex < scopedPreflightRunIndex ||
    currentApiStopIndex < googlePreflightIndex ||
    apiRollbackActivationIndex < currentApiRenameIndex ||
    currentApiStopIndex < apiRollbackActivationIndex ||
    identityApplyIndex < 0 ||
    currentApiStopIndex > identityApplyIndex ||
    candidateGoogleMethodIndex < identityApplyIndex ||
    productionApiStartIndex < candidateGoogleMethodIndex ||
    publicApiHealthIndex < identityApplyIndex ||
    publicGoogleMethodIndex < publicApiHealthIndex ||
    maintenanceCompleteIndex < publicGoogleMethodIndex ||
    deferredFrontendIndex < publicGoogleMethodIndex ||
    frontendLocalHealthIndex < deferredFrontendIndex ||
    frontendPublicHealthIndex < frontendLocalHealthIndex ||
    !remoteDeploy.includes('trap identity_exit_trap EXIT') ||
    !remoteDeploy.includes('restore_identity_api') ||
    !remoteDeploy.includes('trap - EXIT HUP INT TERM')
  ) {
    violations.push(
      'identity apply must run only after preserving and stopping the current API container under a failure-restoring maintenance trap'
    )
  }
  for (const dirtyCheckoutCase of [
    {
      name: 'unstaged tracked change',
      fragment: 'git -C /home/lighthouse/blog/sun-world diff --quiet --',
    },
    {
      name: 'staged tracked change',
      fragment:
        'git -C /home/lighthouse/blog/sun-world diff --cached --quiet --',
    },
    {
      name: 'untracked Python shadow or other non-ignored file',
      fragment:
        'git -C /home/lighthouse/blog/sun-world status --porcelain --untracked-files=all',
    },
  ]) {
    if (!remoteDeploy.includes(dirtyCheckoutCase.fragment)) {
      violations.push(
        `scoped deploy must reject a dirty checkout case: ${dirtyCheckoutCase.name}`
      )
    }
  }
  for (const fragment of [
    'callback_snippet_meta=',
    '[ "$callback_snippet_meta" != "root:root:644" ]',
    '/etc/nginx/snippets/sun-world-oauth-callback-no-log.conf',
  ]) {
    if (!remoteDeploy.includes(fragment)) {
      violations.push(
        `scoped deploy must verify the fixed callback snippet before reading live Nginx config: ${fragment}`
      )
    }
  }
  const restoreApiFunction = remoteDeploy.slice(
    remoteDeploy.indexOf('restore_identity_api() {'),
    remoteDeploy.indexOf('identity_exit_trap() {')
  )
  if (
    !restoreApiFunction.includes(
      'sudo docker rename sun-world-api-identity-backup sun-world-api'
    ) ||
    !restoreApiFunction.includes('sudo docker start sun-world-api') ||
    !restoreApiFunction.includes('sudo systemctl disable blog-api.service') ||
    restoreApiFunction.includes('sudo systemctl start blog-api.service')
  ) {
    violations.push(
      'identity failure recovery must restore the recorded Docker API container without starting legacy systemd'
    )
  }
  const apiBackupValidationIndex = restoreApiFunction.indexOf(
    'if [ "$backup_id" != "$PREVIOUS_API_CONTAINER_ID" ]'
  )
  const apiReplacementRemovalIndex = restoreApiFunction.indexOf(
    'sudo docker rm -f sun-world-api'
  )
  const restoreFrontendFunction = remoteDeploy.slice(
    remoteDeploy.indexOf('restore_identity_frontend() {'),
    remoteDeploy.indexOf('identity_frontend_exit_trap() {')
  )
  const frontendBackupValidationIndex = restoreFrontendFunction.indexOf(
    'if [ "$backup_id" != "$LEGACY_FRONTEND_CONTAINER_ID" ]'
  )
  const frontendReplacementRemovalIndex = restoreFrontendFunction.indexOf(
    'sudo docker rm -f my-frontend'
  )
  const frontendRestoreHealthIndex = restoreFrontendFunction.indexOf(
    'curl -fsSI http://127.0.0.1:8081'
  )
  if (
    apiBackupValidationIndex < 0 ||
    apiReplacementRemovalIndex < apiBackupValidationIndex ||
    frontendBackupValidationIndex < 0 ||
    frontendReplacementRemovalIndex < frontendBackupValidationIndex ||
    frontendRestoreHealthIndex < frontendReplacementRemovalIndex ||
    remoteDeploy.includes('restore_identity_frontend || true')
  ) {
    violations.push(
      'rename failure recovery must validate recorded API/frontend backups before removing any replacement container'
    )
  }

  const webOnlyRollbackStart = remoteDeploy.indexOf(
    'if [ "$DEPLOYMENT_MODE" = "deploy-existing" ] && [ "$API_CHANGED" != "true" ]; then'
  )
  const webOnlyRecordIndex = remoteDeploy.indexOf(
    'LEGACY_FRONTEND_CONTAINER_ID="$(sudo docker inspect',
    webOnlyRollbackStart
  )
  const webOnlyTrapIndex = remoteDeploy.indexOf(
    'trap identity_frontend_exit_trap EXIT',
    webOnlyRollbackStart
  )
  const webOnlyRenameIndex = remoteDeploy.indexOf(
    'sudo docker rename my-frontend my-frontend-identity-backup',
    webOnlyRollbackStart
  )
  const webOnlyActivationIndex = remoteDeploy.indexOf(
    'IDENTITY_FRONTEND_ROLLBACK_ACTIVE=true',
    webOnlyRollbackStart
  )
  const webOnlyStopIndex = remoteDeploy.indexOf(
    'sudo docker stop my-frontend-identity-backup',
    webOnlyRollbackStart
  )
  const webOnlyStartIndex = remoteDeploy.indexOf(
    'sudo docker run -d --restart unless-stopped --name my-frontend -p 8081:80 "$FRONTEND_IMAGE"',
    webOnlyRollbackStart
  )
  if (
    webOnlyRollbackStart < 0 ||
    webOnlyRecordIndex < webOnlyRollbackStart ||
    webOnlyTrapIndex < webOnlyRecordIndex ||
    webOnlyRenameIndex < webOnlyTrapIndex ||
    webOnlyActivationIndex < webOnlyRenameIndex ||
    webOnlyStopIndex < webOnlyActivationIndex ||
    webOnlyStartIndex < webOnlyStopIndex
  ) {
    violations.push(
      'manual deploy-existing web-only retries must preserve and trap-restore the current frontend before replacement'
    )
  }

  const finalFrontendGateStart = remoteDeploy.lastIndexOf(
    'FRONTEND_READY=false'
  )
  const finalFrontendLocalGateIndex = remoteDeploy.indexOf(
    'curl -fsSI http://127.0.0.1:8081 >/dev/null &&',
    finalFrontendGateStart
  )
  const finalFrontendPrimaryGateIndex = remoteDeploy.indexOf(
    'curl -fsSI https://sunworld.site >/dev/null &&',
    finalFrontendGateStart
  )
  const finalFrontendWwwGateIndex = remoteDeploy.indexOf(
    'curl -fsSI https://www.sunworld.site >/dev/null; then',
    finalFrontendGateStart
  )
  const finalFrontendReadyIndex = remoteDeploy.indexOf(
    'FRONTEND_READY=true',
    finalFrontendGateStart
  )
  if (
    finalFrontendGateStart < 0 ||
    finalFrontendLocalGateIndex < finalFrontendGateStart ||
    finalFrontendPrimaryGateIndex < finalFrontendLocalGateIndex ||
    finalFrontendWwwGateIndex < finalFrontendPrimaryGateIndex ||
    finalFrontendReadyIndex < finalFrontendWwwGateIndex
  ) {
    violations.push(
      'frontend success must recheck direct local port 8081 plus both public domains before releasing rollback'
    )
  }
  if (workflow.includes('cancel-in-progress: true')) {
    violations.push(
      'production deploy workflow must not cancel an in-flight identity maintenance window'
    )
  }

  if (/docker run -d --rm --name sun-world-api-candidate/.test(workflow)) {
    violations.push(
      'candidate API container must not use --rm so failed health checks can print logs before cleanup'
    )
  }

  if (
    /docker compose --profile api up|systemctl restart blog-api\.service|my-api|sun-world-api.*-p 8000:8000|ghcr\.io|docker load|api-image\.tar\.gz/.test(
      workflow
    )
  ) {
    violations.push(
      'deploy workflow must use the guarded host-network API container cutover path'
    )
  }
}

if (googleOutboundPreflight) {
  const requiredFragments = [
    'EXPECTED_RUNTIME_ENV = "production"',
    'os.getenv("BLOG_RUNTIME_ENV") != EXPECTED_RUNTIME_ENV',
    'Google login runtime is not production-safe.',
    'EXPECTED_PUBLIC_ORIGINS',
    '"AUTH_PUBLIC_API_ORIGIN": "https://api.sunworld.site"',
    '"AUTH_PUBLIC_WEB_ORIGIN": "https://sunworld.site"',
    '_public_origins_are_production_safe()',
    'Google login public origins are not production-safe.',
    'OAuthProviderRegistry.from_env()',
    'registry.is_enabled("google")',
    'Google login is not enabled.',
    'GOOGLE_DISCOVERY_ENDPOINT',
    'GOOGLE_TOKEN_ENDPOINT',
    'GOOGLE_USERINFO_ENDPOINT',
    'GOOGLE_JWKS_ENDPOINT',
    '_oauth_http_client(proxy_url=proxy_url)',
  ]
  for (const fragment of requiredFragments) {
    if (!googleOutboundPreflight.includes(fragment)) {
      violations.push(`Google outbound preflight must contain: ${fragment}`)
    }
  }
  if (
    /print\([^\n]*(client[_ -]?id|client[_ -]?secret|proxy[_ -]?url|password|exception|exc)/i.test(
      googleOutboundPreflight
    )
  ) {
    violations.push(
      'Google outbound preflight must not print credentials, proxy configuration, passwords, or exception details'
    )
  }
}

if (redisCutoverPreflight) {
  const requiredFragments = [
    'MINIMUM_GETDEL_VERSION = (6, 2)',
    'server_version = client.info("server").get("redis_version")',
    'version[:2] >= MINIMUM_GETDEL_VERSION',
    'Identity Redis capability preflight failed.',
    'Identity Redis capability preflight passed:',
  ]
  for (const fragment of requiredFragments) {
    if (!redisCutoverPreflight.includes(fragment)) {
      violations.push(`Redis cutover preflight must contain: ${fragment}`)
    }
  }
  if (
    /print\([^\n]*(config|password|redis_config|exception|exc)/i.test(
      redisCutoverPreflight
    )
  ) {
    violations.push(
      'Redis cutover preflight must not print connection configuration, passwords, or exception details'
    )
  }
}

if (identityCutoverGate) {
  const requiredFragments = [
    "export const IDENTITY_SCHEMA_MODE = 'identity-20260829'",
    "export const MAIN_REF = 'refs/heads/main'",
    "export const REQUIRED_IDENTITY_SCHEMA_ACK = '20260829_identity_schema'",
    "'STOP_CURRENT_API_FOR_IDENTITY_CUTOVER'",
    "'AUTO_DEPLOY_TIMER_STOPPED_FOR_IDENTITY_CUTOVER'",
    'export const REVIEWED_SHA_PATTERN = /^[0-9a-f]{40}$/',
    "eventName !== 'workflow_dispatch'",
    'ref !== MAIN_REF',
    'workflowSha !== allowedSha',
    "deploymentMode !== 'deploy-existing'",
    'imageTag !== allowedSha',
    'schemaAck !== REQUIRED_IDENTITY_SCHEMA_ACK',
    'maintenanceAck !== REQUIRED_IDENTITY_MAINTENANCE_ACK',
    'timerAck !== REQUIRED_IDENTITY_TIMER_ACK',
    'export function shouldStageIdentityCutoverPush',
    'export function isCommitImageTag',
    "eventName === 'push'",
    'imageTag === allowedSha',
  ]
  for (const fragment of requiredFragments) {
    if (!identityCutoverGate.includes(fragment)) {
      violations.push(`identity cutover gate must contain: ${fragment}`)
    }
  }
}

if (migration) {
  const requiredFragments = [
    'MYSQL_SCHEMA',
    'def api_root',
    'def build_plan',
    'def apply_plan',
    'def validate_schema',
    '"src" / "conf"',
    'CREATE TABLE',
    'ALTER TABLE',
    '--mode',
  ]

  for (const fragment of requiredFragments) {
    if (!migration.includes(fragment)) {
      violations.push(`schema migration module must contain: ${fragment}`)
    }
  }

  if (migration.includes('parents[5]')) {
    violations.push(
      'schema migration config path resolution must support the Docker /app layout'
    )
  }
}

if (identityMigration) {
  const requiredFragments = [
    'MIGRATION_ID = "20260829_identity_schema"',
    'IDENTITY_TABLE_NAMES',
    '"auth_identities"',
    '"auth_verified_contacts"',
    '"auth_security_events"',
    'ALLOWED_USERNAME_ACTIONS',
    'ALTER TABLE `users` ADD UNIQUE KEY `idx_users_username` (`username`)',
    'def validate_scoped_actions',
    'def build_identity_plan',
    'acknowledgement != MIGRATION_ID',
    'validation_errors.extend(validate_scoped_actions(remaining))',
    'default="check"',
  ]
  for (const fragment of requiredFragments) {
    if (!identityMigration.includes(fragment)) {
      violations.push(`identity schema migration must contain: ${fragment}`)
    }
  }

  if (
    /DROP\s+TABLE|DROP\s+COLUMN|MODIFY\s+COLUMN|CHANGE\s+COLUMN|DELETE\s+FROM|UPDATE\s+`/i.test(
      identityMigration
    )
  ) {
    violations.push(
      'identity schema migration must not delete data or rewrite existing columns'
    )
  }
}

if (!runApiCheck.includes('schema_migration.py')) {
  violations.push(
    'scripts/run-api-check.mjs must include the MySQL schema migration static check'
  )
}

if (
  !runApiCheck.includes("'test_*.py'") ||
  runApiCheck.includes("'test_ai_*.py'")
) {
  violations.push(
    'scripts/run-api-check.mjs must execute the complete API unittest suite'
  )
}

if (
  packageJson.scripts?.['check:api:deploy-schema'] !==
  'node scripts/check-api-deploy-schema.mjs'
) {
  violations.push('root package.json must expose check:api:deploy-schema')
}

if (cutoverRunbook) {
  const auditStart = cutoverRunbook.indexOf("sudo python3 - <<'PY'")
  const auditEnd = cutoverRunbook.indexOf('\nPY\n', auditStart)
  const auditBlock =
    auditStart >= 0 && auditEnd > auditStart
      ? cutoverRunbook.slice(auditStart, auditEnd)
      : ''
  const positiveCountIndex = auditBlock.indexOf('if count > 0:')
  const positiveFailureIndex = auditBlock.indexOf(
    'audit_failed = True',
    positiveCountIndex
  )
  for (const fragment of [
    'callback = re.compile(r"/auth/oauth/(google|qq|wechat)/callback\\?")',
    'print(f"{path.name}:{count}")',
    'nginx-log-audit:AUDIT_FAILED',
    'raise SystemExit(1 if audit_failed else 0)',
  ]) {
    if (!auditBlock.includes(fragment)) {
      violations.push(`historical OAuth log audit must contain: ${fragment}`)
    }
  }
  if (
    positiveCountIndex < 0 ||
    positiveFailureIndex < positiveCountIndex ||
    /print\([^\n]*(line|query|string|match\.group)/i.test(auditBlock)
  ) {
    violations.push(
      'historical OAuth log audit must fail on a positive count without printing matched log content'
    )
  }
}

for (const fragment of [
  'sun-world-api',
  'schema_migration',
  'schema_mode',
  'identity-20260829',
  'mode=deploy-existing',
  'identity_timer_ack=AUTO_DEPLOY_TIMER_STOPPED_FOR_IDENTITY_CUTOVER',
  'sun-world-auto-deploy.timer',
  'sun-world-oauth-callback-no-log.conf',
  '/etc/nginx/snippets/sun-world-oauth-callback-no-log.conf',
  'BLOG_RUNTIME_ENV=production',
  'non-ignored untracked',
  'Redis 6.2+',
  '/auth/methods',
  'timeout is 60',
  'target=web',
]) {
  if (!backendDoc.includes(fragment)) {
    violations.push(`backend deploy doc must contain: ${fragment}`)
  }
}

if (violations.length) {
  console.error('API deploy/schema protocol failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('API deploy/schema protocol passed.')
