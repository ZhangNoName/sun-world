#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import {
  FULL_SCHEMA_MODE,
  IDENTITY_SCHEMA_MODE,
  MAIN_REF,
  REQUIRED_IDENTITY_MAINTENANCE_ACK,
  REQUIRED_IDENTITY_SCHEMA_ACK,
  REQUIRED_IDENTITY_TIMER_ACK,
  isCommitImageTag,
  shouldStageIdentityCutoverPush,
  validateIdentityCutoverGate,
} from './identity-cutover-gate.mjs'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workflowPath = join(repoRoot, '.github', 'workflows', 'deploy.yml')
const deployDocPath = join(repoRoot, 'deploy', 'frontend', 'README.md')
const runtimeVerifierPath = join(
  repoRoot,
  'deploy',
  'frontend',
  'verify_runtime_artifact.py'
)
const knownHostsPath = join(repoRoot, 'deploy', 'lighthouse_known_hosts')
const checkAllPath = join(repoRoot, 'scripts', 'check-all.mjs')
const packageJsonPath = join(repoRoot, 'package.json')
const violations = []

if (!existsSync(workflowPath)) {
  violations.push('.github/workflows/deploy.yml must exist')
}

if (!existsSync(runtimeVerifierPath)) {
  violations.push('deploy/frontend/verify_runtime_artifact.py must exist')
}

if (!existsSync(knownHostsPath)) {
  violations.push('deploy/lighthouse_known_hosts must exist')
}

const workflow = existsSync(workflowPath)
  ? readFileSync(workflowPath, 'utf8')
  : ''
const deployDoc = existsSync(deployDocPath)
  ? readFileSync(deployDocPath, 'utf8')
  : ''
const runtimeVerifier = existsSync(runtimeVerifierPath)
  ? readFileSync(runtimeVerifierPath, 'utf8')
  : ''
const knownHosts = existsSync(knownHostsPath)
  ? readFileSync(knownHostsPath, 'utf8')
  : ''
const checkAll = existsSync(checkAllPath)
  ? readFileSync(checkAllPath, 'utf8')
  : ''
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1
}

const reviewedShaA = 'a'.repeat(40)
const reviewedShaB = 'b'.repeat(40)
const validIdentityGate = {
  eventName: 'workflow_dispatch',
  ref: MAIN_REF,
  workflowSha: reviewedShaA,
  deploymentMode: 'deploy-existing',
  schemaMode: IDENTITY_SCHEMA_MODE,
  apiChanged: 'true',
  deployNeeded: 'true',
  imageTag: reviewedShaA,
  allowedSha: reviewedShaA,
  schemaAck: REQUIRED_IDENTITY_SCHEMA_ACK,
  maintenanceAck: REQUIRED_IDENTITY_MAINTENANCE_ACK,
  timerAck: REQUIRED_IDENTITY_TIMER_ACK,
}
const gateCases = [
  {
    name: 'push keeps full mode without cutover authorization',
    valid: true,
    values: {
      ...validIdentityGate,
      eventName: 'push',
      schemaMode: FULL_SCHEMA_MODE,
      allowedSha: '',
      schemaAck: '',
      maintenanceAck: '',
      timerAck: '',
    },
  },
  {
    name: 'pull requests keep full mode without cutover authorization',
    valid: true,
    values: {
      ...validIdentityGate,
      eventName: 'pull_request',
      schemaMode: FULL_SCHEMA_MODE,
      allowedSha: '',
      schemaAck: '',
      maintenanceAck: '',
      timerAck: '',
    },
  },
  {
    name: 'manual full mode does not require identity acknowledgements',
    valid: true,
    values: {
      ...validIdentityGate,
      schemaMode: FULL_SCHEMA_MODE,
      allowedSha: '',
      schemaAck: '',
      maintenanceAck: '',
      timerAck: '',
    },
  },
  {
    name: 'reviewed build-and-deploy identity image fails',
    valid: false,
    values: { ...validIdentityGate, deploymentMode: 'build-and-deploy' },
  },
  {
    name: 'reviewed deploy-existing identity image passes',
    valid: true,
    values: {
      ...validIdentityGate,
      workflowSha: reviewedShaB,
      imageTag: reviewedShaB,
      allowedSha: reviewedShaB,
    },
  },
  {
    name: 'identity selection on push fails',
    valid: false,
    values: { ...validIdentityGate, eventName: 'push' },
  },
  {
    name: 'identity selection outside main fails',
    valid: false,
    values: { ...validIdentityGate, ref: 'refs/heads/feature' },
  },
  {
    name: 'identity selection after main moves fails',
    valid: false,
    values: { ...validIdentityGate, workflowSha: reviewedShaB },
  },
  {
    name: 'identity selection without API target fails',
    valid: false,
    values: { ...validIdentityGate, apiChanged: 'false' },
  },
  {
    name: 'identity build-only selection fails',
    valid: false,
    values: { ...validIdentityGate, deployNeeded: 'false' },
  },
  {
    name: 'identity selection without allowed SHA fails',
    valid: false,
    values: { ...validIdentityGate, allowedSha: '' },
  },
  {
    name: 'identity selection with uppercase SHA fails',
    valid: false,
    values: { ...validIdentityGate, allowedSha: 'A'.repeat(40) },
  },
  {
    name: 'identity selection with mismatched image fails',
    valid: false,
    values: { ...validIdentityGate, allowedSha: reviewedShaB },
  },
  {
    name: 'identity selection without schema acknowledgement fails',
    valid: false,
    values: { ...validIdentityGate, schemaAck: '' },
  },
  {
    name: 'identity selection with wrong schema acknowledgement fails',
    valid: false,
    values: { ...validIdentityGate, schemaAck: 'identity_schema' },
  },
  {
    name: 'identity selection without maintenance acknowledgement fails',
    valid: false,
    values: { ...validIdentityGate, maintenanceAck: '' },
  },
  {
    name: 'identity selection with wrong maintenance acknowledgement fails',
    valid: false,
    values: { ...validIdentityGate, maintenanceAck: 'yes' },
  },
  {
    name: 'identity selection without timer acknowledgement fails',
    valid: false,
    values: { ...validIdentityGate, timerAck: '' },
  },
  {
    name: 'identity selection with wrong timer acknowledgement fails',
    valid: false,
    values: { ...validIdentityGate, timerAck: 'stopped' },
  },
  {
    name: 'unsupported schema mode fails',
    valid: false,
    values: { ...validIdentityGate, schemaMode: 'partial' },
  },
]

for (const gateCase of gateCases) {
  const valid = validateIdentityCutoverGate(gateCase.values).length === 0
  if (valid !== gateCase.valid) {
    violations.push(
      `identity cutover gate combination has unexpected result: ${gateCase.name}`
    )
  }
}

const pushStageCases = [
  {
    name: 'matching reviewed API push stages without deploy',
    expected: true,
    values: {
      eventName: 'push',
      ref: MAIN_REF,
      apiChanged: 'true',
      imageTag: reviewedShaA,
      allowedSha: reviewedShaA,
    },
  },
  {
    name: 'mismatched reviewed SHA keeps normal push deploy',
    expected: false,
    values: {
      eventName: 'push',
      ref: MAIN_REF,
      apiChanged: 'true',
      imageTag: reviewedShaA,
      allowedSha: reviewedShaB,
    },
  },
  {
    name: 'malformed reviewed SHA keeps normal push deploy',
    expected: false,
    values: {
      eventName: 'push',
      ref: MAIN_REF,
      apiChanged: 'true',
      imageTag: reviewedShaA,
      allowedSha: 'A'.repeat(40),
    },
  },
  {
    name: 'web-only reviewed push keeps normal push deploy',
    expected: false,
    values: {
      eventName: 'push',
      ref: MAIN_REF,
      apiChanged: 'false',
      imageTag: reviewedShaA,
      allowedSha: reviewedShaA,
    },
  },
  {
    name: 'non-main push keeps normal push deploy',
    expected: false,
    values: {
      eventName: 'push',
      ref: 'refs/heads/feature',
      apiChanged: 'true',
      imageTag: reviewedShaA,
      allowedSha: reviewedShaA,
    },
  },
  {
    name: 'manual deploy never enters push staging',
    expected: false,
    values: {
      eventName: 'workflow_dispatch',
      ref: MAIN_REF,
      apiChanged: 'true',
      imageTag: reviewedShaA,
      allowedSha: reviewedShaA,
    },
  },
]

for (const pushStageCase of pushStageCases) {
  const actual = shouldStageIdentityCutoverPush(pushStageCase.values)
  if (actual !== pushStageCase.expected) {
    violations.push(
      `identity cutover push-stage combination has unexpected result: ${pushStageCase.name}`
    )
  }
}

const imageTagCases = [
  [reviewedShaA, true],
  ['', false],
  ['a'.repeat(39), false],
  ['A'.repeat(40), false],
  [`${'a'.repeat(40)};touch injected`, false],
  [`${'a'.repeat(20)} ${'b'.repeat(20)}`, false],
  [`${'a'.repeat(40)}\nsecond-command`, false],
]
for (const [imageTag, expected] of imageTagCases) {
  if (isCommitImageTag(imageTag) !== expected) {
    violations.push('deploy-existing image-tag validation matrix failed')
  }
}

if (workflow) {
  const requiredFragments = [
    'name: Deploy Sun World',
    'pull_request:',
    'push:',
    'branches:',
    '- main',
    'paths-ignore:',
    "- '**/*.md'",
    "- 'docs/**'",
    'workflow_dispatch:',
    'mode:',
    'build-and-deploy',
    'build-only',
    'deploy-existing',
    'target:',
    'schema_mode:',
    'API schema migration scope',
    'default: full',
    'identity-20260829',
    'identity_schema_ack:',
    'Type 20260829_identity_schema for the reviewed identity cutover only',
    'identity_maintenance_ack:',
    'Type STOP_CURRENT_API_FOR_IDENTITY_CUTOVER to accept API downtime',
    'identity_timer_ack:',
    'Type AUTO_DEPLOY_TIMER_STOPPED_FOR_IDENTITY_CUTOVER after stopping and masking the timer',
    'image_tag:',
    'concurrency:',
    'deploy-sun-world-production',
    'cancel-in-progress: false',
    'permissions:',
    'contents: read',
    'detect-changes:',
    'Detect changed deploy targets',
    'quality-common:',
    'Format and workflow checks',
    'quality-web:',
    'Frontend checks',
    'quality-api:',
    'API checks',
    'timeout-minutes: 15',
    'pnpm format:check',
    'pnpm check:github-actions:ci',
    'pnpm check:github-actions:deploy',
    'web_changed:',
    'api_changed:',
    'any_changed:',
    'build_needed:',
    'deploy_needed:',
    'image_tag:',
    'schema_mode: ${{ steps.detect.outputs.schema_mode }}',
    'schema_mode=full',
    'mode=automatic',
    'schema_mode="${{ inputs.schema_mode }}"',
    'IDENTITY_CUTOVER_ALLOWED_SHA: ${{ vars.IDENTITY_CUTOVER_ALLOWED_SHA }}',
    'DISPATCH_IMAGE_TAG: ${{ inputs.image_tag }}',
    'IDENTITY_SCHEMA_ACK: ${{ inputs.identity_schema_ack }}',
    'IDENTITY_MAINTENANCE_ACK: ${{ inputs.identity_maintenance_ack }}',
    'IDENTITY_TIMER_ACK: ${{ inputs.identity_timer_ack }}',
    'node scripts/identity-cutover-gate.mjs validate',
    'node scripts/identity-cutover-gate.mjs should-stage-push',
    'node scripts/identity-cutover-gate.mjs validate-image-tag "$image_tag"',
    '"$GITHUB_REF"',
    '"$GITHUB_SHA"',
    'stage_identity_cutover=',
    'Reviewed identity cutover SHA will be built without an automatic production deploy.',
    '"$IDENTITY_CUTOVER_ALLOWED_SHA"',
    '"$IDENTITY_SCHEMA_ACK"',
    '"$IDENTITY_MAINTENANCE_ACK"',
    '"$IDENTITY_TIMER_ACK"',
    'image_tag is required when mode=deploy-existing.',
    'github.event_name }}" = "pull_request"',
    'github.event.pull_request.base.sha',
    'build_needed=false',
    'deploy_needed=false',
    '.github/workflows/deploy.yml)',
    'Workflow-only changes should validate the pipeline shape but',
    'should not redeploy production images.',
    'packages/ai-composer/*|packages/ai-composer/**|packages/ai-ui/*|packages/ai-ui/**|packages/base-ui/*|packages/base-ui/**',
    'deploy/frontend/Dockerfile.runtime|deploy/frontend/nginx.conf|deploy/frontend/verify_runtime_artifact.py)',
    'deploy/backend/*.md|deploy/backend/**/*.md|deploy/frontend/*.md|deploy/frontend/**/*.md|scripts/*|scripts/**)',
    'Deployment docs and local verification scripts do not enter',
    'the production images.',
    'build-web:',
    'build-api:',
    'deploy:',
    'FRONTEND_IMAGE_NAME: sun-world-frontend',
    'API_IMAGE_NAME: sun-world-api',
    'NPM_CONFIG_REGISTRY: https://registry.npmjs.org/',
    'actions/setup-python@v5',
    "python-version: '3.11'",
    'Install API dependencies',
    'python -m pip install ./apps/api',
    'pnpm check:web',
    'pnpm check:api',
    'frontend_archive_sha256: ${{ steps.frontend_runtime.outputs.archive_sha256 }}',
    'frontend_archive_bytes: ${{ steps.frontend_runtime.outputs.archive_bytes }}',
    'frontend_file_count: ${{ steps.frontend_runtime.outputs.file_count }}',
    'frontend_uncompressed_bytes: ${{ steps.frontend_runtime.outputs.uncompressed_bytes }}',
    'frontend_manifest_sha256: ${{ steps.frontend_runtime.outputs.manifest_sha256 }}',
    'Prepare frontend runtime artifact',
    "github.ref == 'refs/heads/main'",
    'WORKFLOW_RUN_ID: ${{ github.run_id }}',
    'WORKFLOW_RUN_ATTEMPT: ${{ github.run_attempt }}',
    'frontend-dist.tar.gz',
    'manifest.json',
    'Upload frontend runtime artifact',
    'frontend-runtime-${{ needs.detect-changes.outputs.image_tag }}-${{ github.run_id }}-${{ github.run_attempt }}',
    'actions/download-artifact@v4',
    'Verify frontend runtime artifact',
    'EXPECTED_ARCHIVE_SHA256: ${{ needs.quality-web.outputs.frontend_archive_sha256 }}',
    'EXPECTED_ARCHIVE_BYTES: ${{ needs.quality-web.outputs.frontend_archive_bytes }}',
    'EXPECTED_FILE_COUNT: ${{ needs.quality-web.outputs.frontend_file_count }}',
    'EXPECTED_UNCOMPRESSED_BYTES: ${{ needs.quality-web.outputs.frontend_uncompressed_bytes }}',
    'EXPECTED_MANIFEST_SHA256: ${{ needs.quality-web.outputs.frontend_manifest_sha256 }}',
    'python3 deploy/frontend/verify_runtime_artifact.py',
    '--expected-run-id "$WORKFLOW_RUN_ID"',
    '--expected-run-attempt "$WORKFLOW_RUN_ATTEMPT"',
    '--expected-sha256 "$EXPECTED_ARCHIVE_SHA256"',
    '--expected-bytes "$EXPECTED_ARCHIVE_BYTES"',
    '--expected-file-count "$EXPECTED_FILE_COUNT"',
    '--expected-uncompressed-bytes "$EXPECTED_UNCOMPRESSED_BYTES"',
    "needs.detect-changes.outputs.web_changed == 'true'",
    "needs.detect-changes.outputs.api_changed == 'true'",
    "needs.quality-web.result == 'success'",
    "needs.quality-api.result == 'success'",
    'Build frontend image on Lighthouse',
    'deploy_image="${FRONTEND_IMAGE_NAME}:${{ needs.detect-changes.outputs.image_tag }}"',
    'deploy_image="${API_IMAGE_NAME}:${{ needs.detect-changes.outputs.image_tag }}"',
    'timeout-minutes: 30',
    'actions/upload-artifact@v4',
    'retention-days: 30',
    'deploy/lighthouse_known_hosts',
    'StrictHostKeyChecking=yes',
    'UserKnownHostsFile="$HOME/.ssh/known_hosts"',
    'vars.LIGHTHOUSE_HOST',
    'vars.LIGHTHOUSE_USER',
    'secrets.LIGHTHOUSE_SSH_KEY',
    'LOCK_FILE="/tmp/sun-world-docker-build.lock"',
    'flock 9',
    'RUNTIME_BASE_IMAGE="sun-world-frontend-runtime-base:bootstrap-v1"',
    'sudo docker image tag "$current_frontend_image_id" "$RUNTIME_BASE_IMAGE"',
    'sudo docker build --pull=false --network=none --progress=plain',
    '--build-arg "RUNTIME_BASE_IMAGE=$RUNTIME_BASE_IMAGE"',
    '-t "$FRONTEND_IMAGE"',
    '-f deploy/frontend/Dockerfile.runtime "$WORK_DIR"',
    'Build API image on Lighthouse',
    'ServerAliveInterval=30',
    'ServerAliveCountMax=10',
    'sudo docker build --progress=plain -t "$API_IMAGE" -f apps/api/Dockerfile apps/api',
    'Deploy changed services on Lighthouse',
    'Sync AI secrets on Lighthouse',
    'AI_CREDENTIAL_ENCRYPTION_KEY: ${{ secrets.AI_CREDENTIAL_ENCRYPTION_KEY }}',
    'DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}',
    'deploy/backend/sync_ai_secrets.py',
    `printf '%s\\0%s\\0'`,
    'Deploy local images on Lighthouse',
    'No frontend post-deploy health check needed for API-only scoped cutover.',
    'needs.detect-changes.outputs.image_tag',
    'SCHEMA_MODE: ${{ needs.detect-changes.outputs.schema_mode }}',
    'DEPLOYMENT_MODE: ${{ inputs.mode }}',
    'SSH_EMPTY_ARGUMENT="__SUN_WORLD_EMPTY_ARGUMENT_V1__"',
    'encode_optional_ssh_argument()',
    'decode_optional_ssh_argument()',
    'SSH_DEPLOYMENT_MODE="$(encode_optional_ssh_argument "$DEPLOYMENT_MODE")"',
    'if [ "$#" -ne 11 ]; then',
    'DEPLOYMENT_MODE="$(decode_optional_ssh_argument "${11}")"',
    'IMAGE_TAG: ${{ needs.detect-changes.outputs.image_tag }}',
    'Scoped identity migration requires an API deployment.',
    'if [ "$DEPLOYMENT_MODE" != "deploy-existing" ]; then',
    'Scoped identity migration requires mode=deploy-existing.',
    'if ! [[ "$IDENTITY_CUTOVER_ALLOWED_SHA" =~ ^[0-9a-f]{40}$ ]]; then',
    'if [ "$IDENTITY_CUTOVER_ALLOWED_SHA" != "$IMAGE_TAG" ]; then',
    'server_checkout_sha=',
    'if [ "$server_checkout_sha" != "$IMAGE_TAG" ]; then',
    'if [ "$API_IMAGE" != "sun-world-api:$IMAGE_TAG" ]; then',
    'if [ "$IDENTITY_SCHEMA_ACK" != "20260829_identity_schema" ]; then',
    'if [ "$IDENTITY_MAINTENANCE_ACK" != "STOP_CURRENT_API_FOR_IDENTITY_CUTOVER" ]; then',
    'if [ "$IDENTITY_TIMER_ACK" != "AUTO_DEPLOY_TIMER_STOPPED_FOR_IDENTITY_CUTOVER" ]; then',
    'sun-world-auto-deploy.timer',
    'sun-world-auto-deploy.service',
    'timer_enabled_state=',
    '"masked-runtime"',
    'Scoped identity cutover requires the frontend auto-deploy timer to be stopped and masked, with its service inactive.',
    'sudo nginx -T 2>&1 |',
    'scripts/check-oauth-callback-log-safety.py --nginx-dump',
    'python -m src.modules.identity.redis_capability_preflight',
    'python -m src.database.mysql.identity_schema_migration --mode plan',
    'python -m src.modules.identity.qq_outbound_preflight',
    '-e BLOG_RUNTIME_ENV=production',
    'check_qq_only_auth_methods',
    'expected = {"google": False, "qq": True, "wechat": False}',
    'len(oauth) == len(expected)',
    'all(actual.get(provider) is enabled for provider, enabled in expected.items())',
    'http://127.0.0.1:18000/auth/methods',
    'https://api.sunworld.site/auth/methods',
    'Candidate API does not report the reviewed QQ-only OAuth matrix.',
    'Public API does not report the reviewed QQ-only OAuth matrix.',
    'Scoped identity cutover requires the current API container.',
    'Scoped identity cutover requires the current API container to be running.',
    '{{.HostConfig.NetworkMode}}',
    '{{.HostConfig.RestartPolicy.Name}}',
    'Scoped identity cutover requires the current API container to pass local port-8000 health.',
    'Scoped identity cutover requires the legacy systemd API to remain inactive and disabled.',
    'PREVIOUS_API_CONTAINER_ID=',
    'PREVIOUS_API_IMAGE=',
    'if [ "$PREVIOUS_API_IMAGE" = "$API_IMAGE" ]; then',
    'sudo systemctl is-active --quiet blog-api.service || sudo systemctl is-enabled --quiet blog-api.service',
    'sudo docker rename sun-world-api sun-world-api-identity-backup',
    'sudo docker stop sun-world-api-identity-backup',
    'sudo docker rename sun-world-api-identity-backup sun-world-api',
    'trap identity_exit_trap EXIT',
    'elif [ "$status" -ne 0 ] && sudo docker container inspect sun-world-api-identity-backup',
    "trap 'exit 130' HUP INT TERM",
    'sudo systemctl stop blog-api.service',
    'restore_identity_api',
    'if [ "$WEB_CHANGED" = "true" ] && [ "$SCHEMA_MODE" = "full" ]; then',
    'Deferring frontend cutover until the scoped API cutover is healthy.',
    'LEGACY_FRONTEND_CONTAINER_ID=',
    'LEGACY_FRONTEND_IMAGE=',
    'restore_identity_frontend',
    'trap identity_frontend_exit_trap EXIT',
    'elif [ "$status" -ne 0 ] && sudo docker container inspect my-frontend-identity-backup',
    'sudo docker rename my-frontend my-frontend-identity-backup',
    'sudo docker stop my-frontend-identity-backup',
    'sudo docker rename my-frontend-identity-backup my-frontend',
    'Previous frontend container was restarted but did not pass local health.',
    'New frontend container failed local port-8081 health.',
    'sudo docker image inspect "$FRONTEND_IMAGE"',
    'sudo docker rm -f my-frontend',
    'if [ "$API_CHANGED" = "true" ]; then',
    'api-deploy-metadata-${{ needs.detect-changes.outputs.image_tag }}',
    'sudo docker image inspect "$API_IMAGE"',
    'python -m src.database.mysql.schema_migration --mode apply',
    'python -m src.database.mysql.identity_schema_migration --mode apply --acknowledge "$1"',
    'python -m src.database.mysql.identity_schema_migration --mode validate',
    'identity-migration "$IDENTITY_SCHEMA_ACK"',
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
    'curl -fsSI https://sunworld.site',
    'curl -fsSI https://www.sunworld.site',
    'No production deploy',
  ]

  for (const fragment of requiredFragments) {
    if (!workflow.includes(fragment)) {
      violations.push(`deploy workflow must contain: ${fragment}`)
    }
  }

  for (const [buildName, buildBlock] of [
    [
      'frontend',
      workflow.match(
        /- name: Build frontend image on Lighthouse[\s\S]*?\r?\n\s+REMOTE(?=\r?\n|$)/
      )?.[0] ?? '',
    ],
    [
      'API',
      workflow.match(
        /- name: Build API image on Lighthouse[\s\S]*?\r?\n\s+REMOTE(?=\r?\n|$)/
      )?.[0] ?? '',
    ],
  ]) {
    if (
      countOccurrences(
        buildBlock,
        'git status --porcelain --untracked-files=all'
      ) < 2 ||
      countOccurrences(buildBlock, 'git diff --quiet --') < 2 ||
      countOccurrences(buildBlock, 'git diff --cached --quiet --') < 2 ||
      buildBlock.includes('git status --short')
    ) {
      violations.push(
        `${buildName} image build must reject staged, unstaged, and untracked dirty checkout cases before and after selecting the reviewed SHA`
      )
    }
  }

  const qualityWebBlock =
    workflow.match(/\r?\n  quality-web:[\s\S]*?\r?\n  quality-api:/)?.[0] ?? ''
  const frontendBuildJob =
    workflow.match(/\r?\n  build-web:[\s\S]*?\r?\n  build-api:/)?.[0] ?? ''
  const apiBuildJob =
    workflow.match(/\r?\n  build-api:[\s\S]*?\r?\n  deploy:/)?.[0] ?? ''
  const artifactPrepareBlock =
    qualityWebBlock.match(
      /- name: Prepare frontend runtime artifact[\s\S]*?(?=\r?\n\s+- name: Upload frontend runtime artifact)/
    )?.[0] ?? ''
  const artifactUploadBlock =
    qualityWebBlock.match(
      /- name: Upload frontend runtime artifact[\s\S]*?(?=\r?\n  quality-api:)/
    )?.[0] ?? ''
  const artifactDownloadBlock =
    frontendBuildJob.match(
      /- name: Download frontend runtime artifact[\s\S]*?(?=\r?\n\s+- name: Verify frontend runtime artifact)/
    )?.[0] ?? ''
  const runnerArtifactVerifyBlock =
    frontendBuildJob.match(
      /- name: Verify frontend runtime artifact[\s\S]*?(?=\r?\n\s+- name: Prepare frontend deploy metadata)/
    )?.[0] ?? ''
  const frontendBuildBlock =
    workflow.match(
      /- name: Build frontend image on Lighthouse[\s\S]*?\r?\n\s+REMOTE(?=\r?\n|$)/
    )?.[0] ?? ''
  const remoteMarkerIndex = frontendBuildBlock.indexOf("<<'REMOTE'")
  const remoteFrontendBuild =
    remoteMarkerIndex >= 0 ? frontendBuildBlock.slice(remoteMarkerIndex) : ''
  const exactFrontendArtifactName =
    'frontend-runtime-${{ needs.detect-changes.outputs.image_tag }}-${{ github.run_id }}-${{ github.run_attempt }}'

  if (
    !artifactUploadBlock.includes(`name: ${exactFrontendArtifactName}`) ||
    !artifactDownloadBlock.includes(`name: ${exactFrontendArtifactName}`) ||
    countOccurrences(workflow, exactFrontendArtifactName) !== 2 ||
    artifactDownloadBlock.includes('run-id:') ||
    artifactDownloadBlock.includes('repository:')
  ) {
    violations.push(
      'frontend dist producer and consumer must use the exact SHA/run_id/run_attempt artifact from the current workflow run'
    )
  }

  if (
    !artifactPrepareBlock.includes(
      "if: github.ref == 'refs/heads/main' && needs.detect-changes.outputs.build_needed == 'true'"
    ) ||
    !artifactUploadBlock.includes(
      "if: github.ref == 'refs/heads/main' && needs.detect-changes.outputs.build_needed == 'true'"
    ) ||
    !frontendBuildJob.includes("github.ref == 'refs/heads/main'") ||
    !apiBuildJob.includes("github.ref == 'refs/heads/main'")
  ) {
    violations.push(
      'artifact production and all production image builds must be gated to refs/heads/main'
    )
  }

  const frontendProducerOutputs = [
    [
      'frontend_archive_sha256: ${{ steps.frontend_runtime.outputs.archive_sha256 }}',
      'echo "archive_sha256=$archive_sha256"',
      'EXPECTED_ARCHIVE_SHA256: ${{ needs.quality-web.outputs.frontend_archive_sha256 }}',
    ],
    [
      'frontend_archive_bytes: ${{ steps.frontend_runtime.outputs.archive_bytes }}',
      'echo "archive_bytes=$archive_bytes"',
      'EXPECTED_ARCHIVE_BYTES: ${{ needs.quality-web.outputs.frontend_archive_bytes }}',
    ],
    [
      'frontend_file_count: ${{ steps.frontend_runtime.outputs.file_count }}',
      'echo "file_count=$file_count"',
      'EXPECTED_FILE_COUNT: ${{ needs.quality-web.outputs.frontend_file_count }}',
    ],
    [
      'frontend_uncompressed_bytes: ${{ steps.frontend_runtime.outputs.uncompressed_bytes }}',
      'echo "uncompressed_bytes=$uncompressed_bytes"',
      'EXPECTED_UNCOMPRESSED_BYTES: ${{ needs.quality-web.outputs.frontend_uncompressed_bytes }}',
    ],
    [
      'frontend_manifest_sha256: ${{ steps.frontend_runtime.outputs.manifest_sha256 }}',
      'echo "manifest_sha256=$manifest_sha256"',
      'EXPECTED_MANIFEST_SHA256: ${{ needs.quality-web.outputs.frontend_manifest_sha256 }}',
    ],
  ]
  for (const [jobOutput, stepOutput, consumerEnv] of frontendProducerOutputs) {
    if (
      !qualityWebBlock.includes(jobOutput) ||
      !artifactPrepareBlock.includes(stepOutput) ||
      countOccurrences(frontendBuildJob, consumerEnv) < 2
    ) {
      violations.push(
        `frontend artifact producer outputs must feed both runner verification and Lighthouse packaging: ${jobOutput}`
      )
    }
  }

  for (const fragment of [
    '"commit": os.environ["IMAGE_TAG"]',
    '"run_id": int(os.environ["WORKFLOW_RUN_ID"])',
    '"run_attempt": int(os.environ["WORKFLOW_RUN_ATTEMPT"])',
    '"sha256": archive_sha256',
    '"bytes": archive_path.stat().st_size',
    '"file_count": len(files)',
    '"uncompressed_bytes": total_bytes',
    '"files": files',
    "tar --sort=name --mtime='UTC 1970-01-01'",
    'gzip -n -9',
  ]) {
    if (!artifactPrepareBlock.includes(fragment)) {
      violations.push(
        `frontend artifact producer must create deterministic, provenance-bound dist metadata: ${fragment}`
      )
    }
  }
  if (
    artifactPrepareBlock.includes('Dockerfile.runtime') ||
    artifactPrepareBlock.includes('nginx.conf') ||
    artifactPrepareBlock.includes('docker save') ||
    artifactPrepareBlock.includes('docker load')
  ) {
    violations.push(
      'frontend runtime artifact must contain only the static dist archive and manifest, not image or server runtime files'
    )
  }

  const verifierArguments = [
    '--archive',
    '--manifest',
    '--output',
    '--expected-commit',
    '--expected-run-id',
    '--expected-run-attempt',
    '--expected-sha256',
    '--expected-bytes',
    '--expected-file-count',
    '--expected-uncompressed-bytes',
  ]
  for (const verificationBlock of [
    runnerArtifactVerifyBlock,
    remoteFrontendBuild,
  ]) {
    if (
      !verificationBlock.includes(
        'python3 deploy/frontend/verify_runtime_artifact.py'
      ) ||
      verifierArguments.some(
        (argument) => !verificationBlock.includes(argument)
      )
    ) {
      violations.push(
        'frontend artifacts must use the safe Python verifier with complete provenance and size expectations on both runner and Lighthouse'
      )
    }
  }

  for (const fragment of [
    '[ "$(sha256sum "$archive" | awk \'{print $1}\')" = "$EXPECTED_ARCHIVE_SHA256" ]',
    '[ "$(stat -c \'%s\' "$archive")" = "$EXPECTED_ARCHIVE_BYTES" ]',
    '[ "$(sha256sum "$manifest" | awk \'{print $1}\')" = "$EXPECTED_MANIFEST_SHA256" ]',
  ]) {
    if (!runnerArtifactVerifyBlock.includes(fragment)) {
      violations.push(
        `runner must independently verify downloaded frontend artifact bytes before safe extraction: ${fragment}`
      )
    }
  }
  for (const fragment of [
    '[ "$(stat -c \'%s\' "$EXPECTED_ARCHIVE_PART")" = "$EXPECTED_ARCHIVE_BYTES" ]',
    '[ "$(sha256sum "$EXPECTED_ARCHIVE_PART" | awk \'{print $1}\')" = "$EXPECTED_ARCHIVE_SHA256" ]',
    '[ "$(sha256sum "$EXPECTED_MANIFEST_PART" | awk \'{print $1}\')" = "$EXPECTED_MANIFEST_SHA256" ]',
  ]) {
    if (!remoteFrontendBuild.includes(fragment)) {
      violations.push(
        `Lighthouse must independently verify uploaded frontend artifact bytes before rename/extraction: ${fragment}`
      )
    }
  }

  if (
    !knownHosts
      .trim()
      .match(/^81\.70\.43\.189 ssh-ed25519 [A-Za-z0-9+/]+={0,2}$/) ||
    knownHosts.trim().split(/\r?\n/).length !== 1 ||
    workflow.includes('ssh-keyscan') ||
    countOccurrences(
      workflow,
      'install -m 600 deploy/lighthouse_known_hosts ~/.ssh/known_hosts'
    ) !== 3
  ) {
    violations.push(
      'all SSH jobs must install the single reviewed Lighthouse ED25519 known_hosts record without dynamic keyscan'
    )
  }
  const transportCommandLines = workflow
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:if\s+)?(?:ssh|scp)\s+-o\b/.test(line))
  if (
    transportCommandLines.length < 1 ||
    transportCommandLines.some(
      (line) =>
        !line.includes('StrictHostKeyChecking=yes') ||
        !line.includes('UserKnownHostsFile="$HOME/.ssh/known_hosts"')
    ) ||
    /StrictHostKeyChecking=(?:no|accept-new)|UserKnownHostsFile=\/dev\/null/.test(
      workflow
    )
  ) {
    violations.push(
      'every SSH/SCP transport command must enforce the pinned known_hosts file with StrictHostKeyChecking=yes'
    )
  }

  if (
    countOccurrences(frontendBuildBlock, 'scp -o StrictHostKeyChecking=yes') !==
      2 ||
    !frontendBuildBlock.includes(
      'remote_prefix="$remote_dir/frontend-runtime-$IMAGE_TAG-$WORKFLOW_RUN_ID-$WORKFLOW_RUN_ATTEMPT"'
    ) ||
    !frontendBuildBlock.includes('"$archive"') ||
    !frontendBuildBlock.includes('"$manifest"')
  ) {
    violations.push(
      'frontend transfer must upload only the current-run dist archive and manifest to run-bound staging names'
    )
  }

  if (
    /\bpnpm\b|\bnpm\b|\bnode(?:js)?\b|\bvite\b|--build-arg\s+VITE_|-f\s+Dockerfile\s+\./i.test(
      remoteFrontendBuild
    )
  ) {
    violations.push(
      'Lighthouse frontend packaging must not run Node, npm, pnpm, Vite, or the source-build Dockerfile'
    )
  }

  const frontendLockIndex = remoteFrontendBuild.indexOf(
    'LOCK_FILE="/tmp/sun-world-docker-build.lock"'
  )
  const frontendFlockIndex = remoteFrontendBuild.indexOf('flock 9')
  const firstFrontendCleanIndex = remoteFrontendBuild.indexOf(
    'git status --porcelain --untracked-files=all'
  )
  const frontendPullIndex = remoteFrontendBuild.indexOf(
    'git pull --ff-only origin main'
  )
  const frontendShaIndex = remoteFrontendBuild.indexOf(
    'if [ "$current_sha" != "$IMAGE_TAG" ]; then'
  )
  const secondFrontendCleanIndex = remoteFrontendBuild.indexOf(
    'git status --porcelain --untracked-files=all',
    firstFrontendCleanIndex + 1
  )
  const remoteVerifierIndex = remoteFrontendBuild.indexOf(
    'python3 deploy/frontend/verify_runtime_artifact.py'
  )
  const runtimeBaseBootstrapIndex = remoteFrontendBuild.indexOf(
    'sudo docker image tag "$current_frontend_image_id" "$RUNTIME_BASE_IMAGE"'
  )
  const runtimeBuildIndex = remoteFrontendBuild.indexOf(
    'sudo docker build --pull=false --network=none --progress=plain'
  )
  if (
    frontendLockIndex < 0 ||
    frontendFlockIndex < frontendLockIndex ||
    firstFrontendCleanIndex < frontendFlockIndex ||
    frontendPullIndex < firstFrontendCleanIndex ||
    frontendShaIndex < frontendPullIndex ||
    secondFrontendCleanIndex < frontendShaIndex ||
    remoteVerifierIndex < secondFrontendCleanIndex ||
    runtimeBaseBootstrapIndex < remoteVerifierIndex ||
    runtimeBuildIndex < runtimeBaseBootstrapIndex ||
    !remoteFrontendBuild.includes(
      '-f deploy/frontend/Dockerfile.runtime "$WORK_DIR"'
    )
  ) {
    violations.push(
      'frontend packaging must hold the shared lock, pass both clean/SHA gates, safely verify dist, bootstrap the fixed local runtime base from the healthy current container, then build without pulls or network'
    )
  }

  if (runtimeVerifier) {
    for (const fragment of [
      'getattr(os, "O_NOFOLLOW", 0)',
      '_require_exact_keys(',
      'PurePosixPath',
      'tarfile.REGTYPE',
      'os.path.commonpath',
      'os.O_EXCL',
      'archive.extractfile(member)',
      'os.rename(staging_path, output_path)',
      'expected_run_id',
      'expected_run_attempt',
      'expected_sha256',
      'expected_bytes',
      'expected_file_count',
      'expected_uncompressed_bytes',
    ]) {
      if (!runtimeVerifier.includes(fragment)) {
        violations.push(
          `frontend runtime verifier must preserve fail-closed archive handling: ${fragment}`
        )
      }
    }
    if (
      /\.extractall\s*\(|(?<!extract)\.extract\s*\(|subprocess\.|os\.system\s*\(/.test(
        runtimeVerifier
      )
    ) {
      violations.push(
        'frontend runtime verifier must not use unsafe tar extraction or shell execution'
      )
    }
  }

  const qualityCommonBlock =
    workflow.match(/\r?\n  quality-common:[\s\S]*?\r?\n  quality-web:/)?.[0] ??
    ''
  const apiBuildStep =
    workflow.match(
      /- name: Build API image on Lighthouse[\s\S]*?\r?\n\s+run: \|/
    )?.[0] ?? ''
  if (countOccurrences(qualityCommonBlock, '\n    steps:') !== 1) {
    violations.push('quality-common must contain exactly one steps mapping')
  }
  if (countOccurrences(apiBuildStep, 'LIGHTHOUSE_HOST:') !== 1) {
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
        `scoped QQ enablement endpoint must be checked exactly once: ${endpoint}`
      )
    }
  }

  const dispatchInputs =
    workflow.match(
      /workflow_dispatch:\r?\n[\s\S]*?\r?\n\r?\nconcurrency:/
    )?.[0] ?? ''
  if (
    !/schema_mode:\r?\n\s+description: API schema migration scope\r?\n\s+required: true\r?\n\s+default: full\r?\n\s+type: choice\r?\n\s+options:\r?\n\s+- full\r?\n\s+- identity-20260829/.test(
      dispatchInputs
    )
  ) {
    violations.push(
      'workflow_dispatch schema_mode must default to full and allow only full or identity-20260829'
    )
  }
  for (const [inputName, description] of [
    [
      'identity_schema_ack',
      'Type 20260829_identity_schema for the reviewed identity cutover only',
    ],
    [
      'identity_maintenance_ack',
      'Type STOP_CURRENT_API_FOR_IDENTITY_CUTOVER to accept API downtime',
    ],
    [
      'identity_timer_ack',
      'Type AUTO_DEPLOY_TIMER_STOPPED_FOR_IDENTITY_CUTOVER after stopping and masking the timer',
    ],
  ]) {
    const inputPattern = new RegExp(
      `${inputName}:\\r?\\n\\s+description: ${description}\\r?\\n\\s+required: false\\r?\\n\\s+type: string`
    )
    if (!inputPattern.test(dispatchInputs)) {
      violations.push(
        `workflow_dispatch must expose optional typed input ${inputName}; the scoped gate alone requires its exact value`
      )
    }
  }

  const detectStep =
    workflow.match(
      /- name: Detect changed deploy targets\r?\n[\s\S]*?\r?\n  quality-common:/
    )?.[0] ?? ''
  const schemaDefaultIndex = detectStep.indexOf('schema_mode=full')
  const dispatchBranchIndex = detectStep.indexOf(
    'if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then'
  )
  const schemaInputIndex = detectStep.indexOf(
    'schema_mode="${{ inputs.schema_mode }}"'
  )
  const identityGateIndex = detectStep.indexOf(
    'node scripts/identity-cutover-gate.mjs validate'
  )
  const changedFilesLoopIndex = detectStep.indexOf(
    'while IFS= read -r file; do'
  )
  if (
    schemaDefaultIndex < 0 ||
    dispatchBranchIndex < 0 ||
    schemaInputIndex < 0 ||
    identityGateIndex < 0 ||
    changedFilesLoopIndex < 0 ||
    schemaDefaultIndex > dispatchBranchIndex ||
    schemaInputIndex < dispatchBranchIndex ||
    identityGateIndex < schemaInputIndex ||
    identityGateIndex > changedFilesLoopIndex
  ) {
    violations.push(
      'detect-changes must default schema_mode to full, resolve manual inputs, and run the identity gate before changed-file processing'
    )
  }

  const modeSelection =
    detectStep.match(/case "\$mode" in([\s\S]*?)\r?\n\s+esac/)?.[1] ?? ''
  const buildAndDeployBranch =
    modeSelection.match(/build-and-deploy\)([\s\S]*?);;/)?.[1] ?? ''
  const deployExistingBranch =
    modeSelection.match(/deploy-existing\)([\s\S]*?);;/)?.[1] ?? ''
  if (!buildAndDeployBranch.includes('image_tag="${{ github.sha }}"')) {
    violations.push(
      'build-and-deploy must bind the reviewed identity gate to github.sha'
    )
  }
  if (
    !deployExistingBranch.includes('build_needed=false') ||
    !detectStep.includes('image_tag="$DISPATCH_IMAGE_TAG"') ||
    !deployExistingBranch.includes(
      'node scripts/identity-cutover-gate.mjs validate-image-tag "$image_tag"'
    )
  ) {
    violations.push(
      'deploy-existing must bind the reviewed identity gate to the explicit image_tag input'
    )
  }
  if (
    !detectStep.includes('DISPATCH_IMAGE_TAG: ${{ inputs.image_tag }}') ||
    detectStep.includes('image_tag="${{ inputs.image_tag }}"') ||
    countOccurrences(workflow, 'inputs.image_tag') !== 1
  ) {
    violations.push(
      'raw deploy-existing image_tag input must enter Bash only through step env before 40-hex validation'
    )
  }

  if (countOccurrences(workflow, 'inputs.schema_mode') !== 1) {
    violations.push(
      'schema_mode input must be consumed only by detect-changes so automatic events remain full'
    )
  }
  for (const inputName of [
    'inputs.identity_schema_ack',
    'inputs.identity_maintenance_ack',
    'inputs.identity_timer_ack',
  ]) {
    if (countOccurrences(workflow, inputName) !== 2) {
      violations.push(
        `${inputName} must be consumed once by detect and once at the deploy boundary`
      )
    }
  }
  if (countOccurrences(workflow, 'vars.IDENTITY_CUTOVER_ALLOWED_SHA') !== 2) {
    violations.push(
      'IDENTITY_CUTOVER_ALLOWED_SHA must be checked at detect and deploy boundaries'
    )
  }
  for (const fragment of [
    'IDENTITY_CUTOVER_ALLOWED_SHA: ${{ vars.IDENTITY_CUTOVER_ALLOWED_SHA }}',
    'IDENTITY_SCHEMA_ACK: ${{ inputs.identity_schema_ack }}',
    'IDENTITY_MAINTENANCE_ACK: ${{ inputs.identity_maintenance_ack }}',
    'IDENTITY_TIMER_ACK: ${{ inputs.identity_timer_ack }}',
    '"$image_tag"',
    '"$IDENTITY_CUTOVER_ALLOWED_SHA"',
    '"$IDENTITY_SCHEMA_ACK"',
    '"$IDENTITY_MAINTENANCE_ACK"',
    '"$IDENTITY_TIMER_ACK"',
    '"$GITHUB_REF"',
    '"$GITHUB_SHA"',
    '"$mode"',
  ]) {
    if (!detectStep.includes(fragment)) {
      violations.push(
        `detect-changes must pass the complete identity authorization to the shared gate: ${fragment}`
      )
    }
  }
  const pushStageIndex = detectStep.indexOf(
    'node scripts/identity-cutover-gate.mjs should-stage-push'
  )
  const deployOutputIndex = detectStep.indexOf(
    'echo "deploy_needed=$deploy_needed"'
  )
  if (
    pushStageIndex < changedFilesLoopIndex ||
    deployOutputIndex < pushStageIndex ||
    !detectStep
      .slice(pushStageIndex, deployOutputIndex)
      .includes('deploy_needed=false')
  ) {
    violations.push(
      'matching reviewed main/API pushes must stage the exact image and force deploy_needed=false before outputs'
    )
  }

  const fullMigrationCommand =
    'python -m src.database.mysql.schema_migration --mode apply'
  const identityApplyCommand =
    'python -m src.database.mysql.identity_schema_migration --mode apply --acknowledge "$1"'
  const identityValidateCommand =
    'python -m src.database.mysql.identity_schema_migration --mode validate'
  for (const [fragment, expectedCount] of [
    [fullMigrationCommand, 1],
    [identityApplyCommand, 1],
    [identityValidateCommand, 1],
  ]) {
    const actualCount = countOccurrences(workflow, fragment)
    if (actualCount !== expectedCount) {
      violations.push(
        `deploy workflow must contain exactly ${expectedCount} occurrence(s) of ${fragment}; found ${actualCount}`
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
  const fullSchemaBranch =
    schemaExecution.match(/full\)([\s\S]*?);;/)?.[1] ?? ''
  const identitySchemaBranch =
    schemaExecution.match(/identity-20260829\)([\s\S]*?);;/)?.[1] ?? ''
  if (!fullSchemaBranch.includes(fullMigrationCommand)) {
    violations.push('full schema mode must run the generic fail-closed apply')
  }
  if (fullSchemaBranch.includes('identity_schema_migration')) {
    violations.push(
      'full schema mode must not run the scoped identity migration'
    )
  }
  if (
    !identitySchemaBranch.includes(identityApplyCommand) ||
    !identitySchemaBranch.includes(identityValidateCommand)
  ) {
    violations.push(
      'identity-20260829 schema mode must run scoped apply with exact acknowledgement followed by validate'
    )
  }
  if (identitySchemaBranch.includes(fullMigrationCommand)) {
    violations.push(
      'identity-20260829 schema mode must skip the generic full-schema apply'
    )
  }
  if (
    workflow.includes(
      'identity_schema_migration --mode apply --acknowledge 20260829_identity_schema'
    )
  ) {
    violations.push(
      'identity schema apply must consume the exact manually typed acknowledgement, not hard-code it'
    )
  }

  const remoteDeploy =
    workflow.match(
      /- name: Deploy local images on Lighthouse[\s\S]*?\r?\n\s+REMOTE(?=\r?\n|$)/
    )?.[0] ?? ''
  const localSshBoundary = remoteDeploy.slice(
    0,
    remoteDeploy.indexOf('ssh -o StrictHostKeyChecking=yes')
  )
  const localAuthorizationCase =
    localSshBoundary.match(
      /case "\$SCHEMA_MODE" in[\s\S]*?\r?\n\s+esac/
    )?.[0] ?? ''
  const hostileAck = "'; printf PWNED >&2; #\nsecond-command"
  const fullBoundaryProbe = spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail\n${localAuthorizationCase}\nprintf '%s\\0%s\\0%s\\0%s\\0' "$IDENTITY_CUTOVER_ALLOWED_SHA" "$IDENTITY_SCHEMA_ACK" "$IDENTITY_MAINTENANCE_ACK" "$IDENTITY_TIMER_ACK"`,
    ],
    {
      env: {
        ...process.env,
        SCHEMA_MODE: 'full',
        DEPLOYMENT_MODE: 'build-and-deploy',
        IMAGE_TAG: reviewedShaA,
        IDENTITY_CUTOVER_ALLOWED_SHA: hostileAck,
        IDENTITY_SCHEMA_ACK: hostileAck,
        IDENTITY_MAINTENANCE_ACK: hostileAck,
        IDENTITY_TIMER_ACK: hostileAck,
      },
    }
  )
  if (
    !localAuthorizationCase ||
    fullBoundaryProbe.status !== 0 ||
    !fullBoundaryProbe.stdout.equals(Buffer.from('\0\0\0\0')) ||
    fullBoundaryProbe.stderr.length !== 0
  ) {
    violations.push(
      'full deploy with malicious identity-only values must clear them before constructing SSH arguments'
    )
  }
  for (const fragment of [
    'IDENTITY_CUTOVER_ALLOWED_SHA=""',
    'IDENTITY_SCHEMA_ACK=""',
    'IDENTITY_MAINTENANCE_ACK=""',
    'IDENTITY_TIMER_ACK=""',
    '[ "$DEPLOYMENT_MODE" != "deploy-existing" ]',
    '! [[ "$IDENTITY_CUTOVER_ALLOWED_SHA" =~ ^[0-9a-f]{40}$ ]]',
    '[ "$IDENTITY_CUTOVER_ALLOWED_SHA" != "$IMAGE_TAG" ]',
  ]) {
    if (!localAuthorizationCase.includes(fragment)) {
      violations.push(
        `local SSH boundary must normalize or validate identity-only input: ${fragment}`
      )
    }
  }
  const sshEmptyArgument = '__SUN_WORLD_EMPTY_ARGUMENT_V1__'
  const sshArgumentEncoding = localSshBoundary.match(
    /SSH_EMPTY_ARGUMENT="__SUN_WORLD_EMPTY_ARGUMENT_V1__"[\s\S]*?SSH_DEPLOYMENT_MODE="\$\(encode_optional_ssh_argument "\$DEPLOYMENT_MODE"\)"/
  )?.[0]
  const fullSshArgumentProbe = spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail\n${localAuthorizationCase}\n${sshArgumentEncoding ?? ''}\nprintf '%s\\0%s\\0%s\\0%s\\0%s\\0' "$SSH_IDENTITY_CUTOVER_ALLOWED_SHA" "$SSH_IDENTITY_SCHEMA_ACK" "$SSH_IDENTITY_MAINTENANCE_ACK" "$SSH_IDENTITY_TIMER_ACK" "$SSH_DEPLOYMENT_MODE"`,
    ],
    {
      env: {
        ...process.env,
        SCHEMA_MODE: 'full',
        DEPLOYMENT_MODE: '',
        IMAGE_TAG: reviewedShaA,
        IDENTITY_CUTOVER_ALLOWED_SHA: hostileAck,
        IDENTITY_SCHEMA_ACK: hostileAck,
        IDENTITY_MAINTENANCE_ACK: hostileAck,
        IDENTITY_TIMER_ACK: hostileAck,
      },
    }
  )
  const expectedEmptySshArguments = Buffer.from(
    Array(5).fill(sshEmptyArgument).join('\0') + '\0'
  )
  if (
    !sshArgumentEncoding ||
    fullSshArgumentProbe.status !== 0 ||
    !fullSshArgumentProbe.stdout.equals(expectedEmptySshArguments) ||
    fullSshArgumentProbe.stderr.length !== 0
  ) {
    violations.push(
      'optional deploy values must be encoded as non-empty SSH arguments after full-mode normalization'
    )
  }
  const manualFullSshArgumentProbe = spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail\n${localAuthorizationCase}\n${sshArgumentEncoding ?? ''}\nprintf '%s\\0%s\\0%s\\0%s\\0%s\\0' "$SSH_IDENTITY_CUTOVER_ALLOWED_SHA" "$SSH_IDENTITY_SCHEMA_ACK" "$SSH_IDENTITY_MAINTENANCE_ACK" "$SSH_IDENTITY_TIMER_ACK" "$SSH_DEPLOYMENT_MODE"`,
    ],
    {
      env: {
        ...process.env,
        SCHEMA_MODE: 'full',
        DEPLOYMENT_MODE: 'build-and-deploy',
        IMAGE_TAG: reviewedShaA,
        IDENTITY_CUTOVER_ALLOWED_SHA: hostileAck,
        IDENTITY_SCHEMA_ACK: hostileAck,
        IDENTITY_MAINTENANCE_ACK: hostileAck,
        IDENTITY_TIMER_ACK: hostileAck,
      },
    }
  )
  const expectedManualFullSshArguments = Buffer.from(
    [...Array(4).fill(sshEmptyArgument), 'build-and-deploy'].join('\0') + '\0'
  )
  if (
    manualFullSshArgumentProbe.status !== 0 ||
    !manualFullSshArgumentProbe.stdout.equals(expectedManualFullSshArguments) ||
    manualFullSshArgumentProbe.stderr.length !== 0
  ) {
    violations.push(
      'manual full deploy must preserve deployment mode after four empty identity arguments'
    )
  }
  const identitySshArgumentProbe = spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail\n${localAuthorizationCase}\n${sshArgumentEncoding ?? ''}\nprintf '%s\\0%s\\0%s\\0%s\\0%s\\0' "$SSH_IDENTITY_CUTOVER_ALLOWED_SHA" "$SSH_IDENTITY_SCHEMA_ACK" "$SSH_IDENTITY_MAINTENANCE_ACK" "$SSH_IDENTITY_TIMER_ACK" "$SSH_DEPLOYMENT_MODE"`,
    ],
    {
      env: {
        ...process.env,
        SCHEMA_MODE: 'identity-20260829',
        DEPLOYMENT_MODE: 'deploy-existing',
        IMAGE_TAG: reviewedShaA,
        IDENTITY_CUTOVER_ALLOWED_SHA: reviewedShaA,
        IDENTITY_SCHEMA_ACK: REQUIRED_IDENTITY_SCHEMA_ACK,
        IDENTITY_MAINTENANCE_ACK: REQUIRED_IDENTITY_MAINTENANCE_ACK,
        IDENTITY_TIMER_ACK: REQUIRED_IDENTITY_TIMER_ACK,
      },
    }
  )
  const expectedIdentitySshArguments = Buffer.from(
    [
      reviewedShaA,
      REQUIRED_IDENTITY_SCHEMA_ACK,
      REQUIRED_IDENTITY_MAINTENANCE_ACK,
      REQUIRED_IDENTITY_TIMER_ACK,
      'deploy-existing',
    ].join('\0') + '\0'
  )
  if (
    identitySshArgumentProbe.status !== 0 ||
    !identitySshArgumentProbe.stdout.equals(expectedIdentitySshArguments) ||
    identitySshArgumentProbe.stderr.length !== 0
  ) {
    violations.push(
      'reviewed identity deploy authorization must pass through SSH encoding unchanged'
    )
  }
  const sentinelCollisionProbe = spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail\n${localAuthorizationCase}\n${sshArgumentEncoding ?? ''}`,
    ],
    {
      env: {
        ...process.env,
        SCHEMA_MODE: 'full',
        DEPLOYMENT_MODE: sshEmptyArgument,
        IMAGE_TAG: reviewedShaA,
        IDENTITY_CUTOVER_ALLOWED_SHA: '',
        IDENTITY_SCHEMA_ACK: '',
        IDENTITY_MAINTENANCE_ACK: '',
        IDENTITY_TIMER_ACK: '',
      },
    }
  )
  if (
    sentinelCollisionProbe.status === 0 ||
    !sentinelCollisionProbe.stderr
      .toString()
      .includes('Reserved SSH argument sentinel is not allowed.')
  ) {
    violations.push(
      'reserved SSH argument sentinel collisions must fail closed'
    )
  }
  const sshInvocationStart = remoteDeploy.indexOf(
    'ssh -o StrictHostKeyChecking=yes'
  )
  const sshInvocationEnd = remoteDeploy.indexOf("<<'REMOTE'")
  const sshInvocation = remoteDeploy.slice(
    sshInvocationStart,
    sshInvocationEnd + "<<'REMOTE'".length
  )
  const normalizedSshInvocation = sshInvocation.replace(/\\\r?\n\s*/g, ' ')
  if (
    !/"\$IMAGE_TAG"\s+"\$SSH_IDENTITY_CUTOVER_ALLOWED_SHA"\s+"\$SSH_IDENTITY_SCHEMA_ACK"\s+"\$SSH_IDENTITY_MAINTENANCE_ACK"\s+"\$SSH_IDENTITY_TIMER_ACK"\s+"\$SSH_DEPLOYMENT_MODE"\s+<<'REMOTE'/.test(
      normalizedSshInvocation
    )
  ) {
    violations.push(
      'SSH invocation must keep image tag, four identity slots, and deployment mode in their fixed order'
    )
  }
  for (const rawVariable of [
    '"$IDENTITY_CUTOVER_ALLOWED_SHA"',
    '"$IDENTITY_SCHEMA_ACK"',
    '"$IDENTITY_MAINTENANCE_ACK"',
    '"$IDENTITY_TIMER_ACK"',
    '"$DEPLOYMENT_MODE"',
  ]) {
    if (sshInvocation.includes(rawVariable)) {
      violations.push(
        `SSH invocation must not pass an unencoded optional value: ${rawVariable}`
      )
    }
  }
  if (countOccurrences(remoteDeploy, sshEmptyArgument) !== 2) {
    violations.push(
      'the local encoder and remote decoder must define the same SSH empty sentinel exactly once each'
    )
  }
  const remoteArgumentCountGuardIndex = remoteDeploy.indexOf(
    'if [ "$#" -ne 11 ]; then'
  )
  const firstRemoteArgumentReadIndex = remoteDeploy.indexOf('WEB_CHANGED="$1"')
  if (
    remoteArgumentCountGuardIndex < 0 ||
    firstRemoteArgumentReadIndex < remoteArgumentCountGuardIndex
  ) {
    violations.push(
      'remote deploy must require exactly 11 arguments before decoding positional values'
    )
  }
  for (const fragment of [
    '"$SSH_IDENTITY_CUTOVER_ALLOWED_SHA"',
    '"$SSH_IDENTITY_SCHEMA_ACK"',
    '"$SSH_IDENTITY_MAINTENANCE_ACK"',
    '"$SSH_IDENTITY_TIMER_ACK"',
    '"$SSH_DEPLOYMENT_MODE"',
    'if [ "$#" -ne 11 ]; then',
    'IDENTITY_CUTOVER_ALLOWED_SHA="$(decode_optional_ssh_argument "$7")"',
    'IDENTITY_SCHEMA_ACK="$(decode_optional_ssh_argument "$8")"',
    'IDENTITY_MAINTENANCE_ACK="$(decode_optional_ssh_argument "$9")"',
    'IDENTITY_TIMER_ACK="$(decode_optional_ssh_argument "${10}")"',
    'DEPLOYMENT_MODE="$(decode_optional_ssh_argument "${11}")"',
  ]) {
    if (!remoteDeploy.includes(fragment)) {
      violations.push(
        `SSH deploy boundary must preserve optional positional arguments: ${fragment}`
      )
    }
  }
  const remoteShaCheckIndex = remoteDeploy.indexOf(
    'if ! [[ "$IDENTITY_CUTOVER_ALLOWED_SHA" =~ ^[0-9a-f]{40}$ ]]; then'
  )
  const remoteLockIndex = remoteDeploy.indexOf(
    'LOCK_FILE="/tmp/sun-world-docker-build.lock"'
  )
  const remoteFlockIndex = remoteDeploy.indexOf('flock 9')
  const timerMaskCheckIndex = remoteDeploy.indexOf('timer_enabled_state=')
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
  const maintenanceTrapIndex = remoteDeploy.indexOf(
    'trap identity_exit_trap EXIT'
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
  const qqPreflightIndex = remoteDeploy.indexOf(
    'python -m src.modules.identity.qq_outbound_preflight'
  )
  const scopedPreflightRunIndex = remoteDeploy.lastIndexOf(
    'sudo docker run --rm --network host',
    qqPreflightIndex
  )
  const scopedPreflightRuntimeIndex = remoteDeploy.lastIndexOf(
    '-e BLOG_RUNTIME_ENV=production',
    qqPreflightIndex
  )
  const currentApiStopIndex = remoteDeploy.indexOf(
    'sudo docker stop sun-world-api-identity-backup'
  )
  const currentApiRenameIndex = remoteDeploy.indexOf(
    'sudo docker rename sun-world-api sun-world-api-identity-backup'
  )
  const apiRollbackActivationIndex = remoteDeploy.indexOf(
    'IDENTITY_MAINTENANCE_ACTIVE=true'
  )
  const scopedApplyIndex = remoteDeploy.indexOf(identityApplyCommand)
  const publicApiHealthIndex = remoteDeploy.indexOf(
    'curl -fsS https://api.sunworld.site/healthz'
  )
  const candidateQqMethodIndex = remoteDeploy.indexOf(
    'http://127.0.0.1:18000/auth/methods'
  )
  const productionApiStartIndex = remoteDeploy.indexOf(
    'sudo docker run -d --restart unless-stopped --name sun-world-api --network host'
  )
  const publicQqMethodIndex = remoteDeploy.indexOf(
    'https://api.sunworld.site/auth/methods'
  )
  const maintenanceCompleteIndex = remoteDeploy.lastIndexOf(
    'IDENTITY_MAINTENANCE_ACTIVE=false'
  )
  const deferredFrontendIndex = remoteDeploy.lastIndexOf(
    'sudo docker rename my-frontend my-frontend-identity-backup'
  )
  const frontendPublicHealthIndex = remoteDeploy.lastIndexOf(
    'curl -fsSI https://sunworld.site'
  )
  const frontendLocalHealthIndex = remoteDeploy.lastIndexOf(
    'curl -fsSI http://127.0.0.1:8081'
  )
  const frontendRollbackClearIndex = remoteDeploy.lastIndexOf(
    'IDENTITY_FRONTEND_ROLLBACK_ACTIVE=false'
  )
  if (
    remoteShaCheckIndex < 0 ||
    remoteLockIndex < 0 ||
    remoteFlockIndex < remoteLockIndex ||
    remoteShaCheckIndex < remoteFlockIndex ||
    serverCheckoutCheckIndex < remoteShaCheckIndex ||
    checkoutUnstagedCheckIndex < serverCheckoutCheckIndex ||
    checkoutStagedCheckIndex < checkoutUnstagedCheckIndex ||
    checkoutUntrackedCheckIndex < checkoutStagedCheckIndex ||
    timerMaskCheckIndex < checkoutUntrackedCheckIndex ||
    callbackSnippetMetadataIndex < timerMaskCheckIndex ||
    nginxLogSafetyIndex < callbackSnippetMetadataIndex ||
    nginxLogSafetyIndex < timerMaskCheckIndex ||
    nginxLogSafetyIndex < remoteShaCheckIndex ||
    redisPreflightIndex < nginxLogSafetyIndex ||
    scopedPlanIndex < redisPreflightIndex ||
    qqPreflightIndex < scopedPlanIndex ||
    scopedPreflightRunIndex < nginxLogSafetyIndex ||
    scopedPreflightRuntimeIndex < scopedPreflightRunIndex ||
    maintenanceTrapIndex < remoteShaCheckIndex ||
    currentApiStopIndex < qqPreflightIndex ||
    currentApiStopIndex < maintenanceTrapIndex ||
    apiRollbackActivationIndex < currentApiRenameIndex ||
    currentApiStopIndex < apiRollbackActivationIndex ||
    scopedApplyIndex < currentApiStopIndex ||
    candidateQqMethodIndex < scopedApplyIndex ||
    productionApiStartIndex < candidateQqMethodIndex ||
    publicApiHealthIndex < scopedApplyIndex ||
    publicQqMethodIndex < publicApiHealthIndex ||
    maintenanceCompleteIndex < publicQqMethodIndex ||
    deferredFrontendIndex < maintenanceCompleteIndex ||
    frontendLocalHealthIndex < deferredFrontendIndex ||
    frontendPublicHealthIndex < deferredFrontendIndex ||
    frontendPublicHealthIndex < frontendLocalHealthIndex ||
    frontendRollbackClearIndex < frontendPublicHealthIndex
  ) {
    violations.push(
      'scoped deploy must revalidate the reviewed image, stop/restore the current API container around apply, pass public API health, then clear recovery and defer frontend cutover until afterward'
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
  for (const fragment of [
    'sudo docker container inspect sun-world-api',
    'sudo docker container inspect sun-world-api-identity-backup',
    'PREVIOUS_API_CONTAINER_ID',
    'PREVIOUS_API_IMAGE',
    'restore_identity_api',
    'sudo docker rm -f sun-world-api',
    'sudo docker rename sun-world-api-identity-backup sun-world-api',
    'sudo docker start sun-world-api',
    'sudo systemctl disable blog-api.service',
    'trap - EXIT HUP INT TERM',
    'LEGACY_FRONTEND_CONTAINER_ID',
    'LEGACY_FRONTEND_IMAGE',
    'restore_identity_frontend',
    'sudo docker rename my-frontend-identity-backup my-frontend',
  ]) {
    if (!remoteDeploy.includes(fragment)) {
      violations.push(
        `scoped maintenance window must fail closed and restore the previous API/frontend containers: ${fragment}`
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
      'identity rollback must restore the recorded Docker API container and must not start the disabled legacy systemd service'
    )
  }
  const apiBackupValidationIndex = restoreApiFunction.indexOf(
    'if [ "$backup_id" != "$PREVIOUS_API_CONTAINER_ID" ]'
  )
  const apiReplacementRemovalIndex = restoreApiFunction.indexOf(
    'sudo docker rm -f sun-world-api'
  )
  if (
    apiBackupValidationIndex < 0 ||
    apiReplacementRemovalIndex < apiBackupValidationIndex
  ) {
    violations.push(
      'API rollback must validate the recorded backup before deleting any replacement; a failed rename must leave the current container untouched'
    )
  }

  const frontendRenameIndex = remoteDeploy.lastIndexOf(
    'sudo docker rename my-frontend my-frontend-identity-backup'
  )
  const frontendRollbackActivationIndex = remoteDeploy.lastIndexOf(
    'IDENTITY_FRONTEND_ROLLBACK_ACTIVE=true'
  )
  const frontendStopIndex = remoteDeploy.lastIndexOf(
    'sudo docker stop my-frontend-identity-backup'
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
    frontendRollbackActivationIndex < frontendRenameIndex ||
    frontendStopIndex < frontendRollbackActivationIndex ||
    frontendBackupValidationIndex < 0 ||
    frontendReplacementRemovalIndex < frontendBackupValidationIndex ||
    frontendRestoreHealthIndex < frontendReplacementRemovalIndex ||
    remoteDeploy.includes('restore_identity_frontend || true')
  ) {
    violations.push(
      'frontend rollback must activate only after rename and validate the recorded backup before deleting any replacement'
    )
  }

  const fullFrontendRollbackStart = remoteDeploy.indexOf(
    'if [ "$WEB_CHANGED" = "true" ] && [ "$SCHEMA_MODE" = "full" ]; then'
  )
  const fullFrontendRecordIndex = remoteDeploy.indexOf(
    'LEGACY_FRONTEND_CONTAINER_ID="$(sudo docker inspect',
    fullFrontendRollbackStart
  )
  const fullFrontendTrapIndex = remoteDeploy.indexOf(
    'trap identity_frontend_exit_trap EXIT',
    fullFrontendRollbackStart
  )
  const fullFrontendRenameIndex = remoteDeploy.indexOf(
    'sudo docker rename my-frontend my-frontend-identity-backup',
    fullFrontendRollbackStart
  )
  const fullFrontendActivationIndex = remoteDeploy.indexOf(
    'IDENTITY_FRONTEND_ROLLBACK_ACTIVE=true',
    fullFrontendRollbackStart
  )
  const fullFrontendStopIndex = remoteDeploy.indexOf(
    'sudo docker stop my-frontend-identity-backup',
    fullFrontendRollbackStart
  )
  const fullFrontendStartIndex = remoteDeploy.indexOf(
    'sudo docker run -d --restart unless-stopped --name my-frontend -p 8081:80 "$FRONTEND_IMAGE"',
    fullFrontendRollbackStart
  )
  if (
    fullFrontendRollbackStart < 0 ||
    fullFrontendRecordIndex < fullFrontendRollbackStart ||
    fullFrontendTrapIndex < fullFrontendRecordIndex ||
    fullFrontendRenameIndex < fullFrontendTrapIndex ||
    fullFrontendActivationIndex < fullFrontendRenameIndex ||
    fullFrontendStopIndex < fullFrontendActivationIndex ||
    fullFrontendStartIndex < fullFrontendStopIndex
  ) {
    violations.push(
      'all full-schema frontend cutovers, including manual deploy-existing web-only retries, must preserve and trap-restore the current frontend before replacement'
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
    finalFrontendReadyIndex < finalFrontendWwwGateIndex ||
    frontendRollbackClearIndex < finalFrontendReadyIndex
  ) {
    violations.push(
      'frontend success must recheck direct local port 8081 plus both public domains before releasing rollback'
    )
  }

  if (workflow.includes('cancel-in-progress: true')) {
    violations.push(
      'production deploy concurrency must queue rather than cancel an in-flight SSH or DDL maintenance window'
    )
  }

  if (
    /docker compose --profile api up|systemctl restart blog-api\.service|-p 8000:8000/.test(
      workflow
    )
  ) {
    violations.push(
      'deploy workflow must not cut over the backend service before approval'
    )
  }

  if (/^\s+quality:\s*$/m.test(workflow) || /needs:\s*quality/.test(workflow)) {
    violations.push(
      'deploy workflow must detect changes before running split quality jobs'
    )
  }

  if (/cache-to:\s*type=/.test(workflow)) {
    violations.push('deploy workflow must not use blocking Buildx cache export')
  }

  if (/buildcache/.test(workflow)) {
    violations.push(
      'deploy workflow must not export registry cache while BuildKit cache export hangs are unresolved'
    )
  }

  if (
    /uses:\s*docker\/build-push-action@v6|docker\/login-action@v3|docker\/setup-buildx-action@v3/.test(
      workflow
    )
  ) {
    violations.push(
      'production images must be packaged or built on Lighthouse, not pushed from GitHub Buildx'
    )
  }

  if (/docker run -d --rm --name sun-world-api-candidate/.test(workflow)) {
    violations.push(
      'candidate API container must not use --rm so failed health checks can print logs before cleanup'
    )
  }

  if (
    /ghcr\.io|ccr\.ccs\.tencentyun\.com|TENCENT_CCR|docker\s+(?:login|pull|save|load)\b|frontend-image\.tar\.gz|api-image\.tar\.gz|appleboy\/ssh-action|packages:\s*write/.test(
      workflow
    )
  ) {
    violations.push(
      'deploy workflow may transfer static dist artifacts only; registry access and Docker image save/load remain forbidden'
    )
  }

  if (/\.github\/workflows\/deploy\.yml\|package\.json/.test(workflow)) {
    violations.push(
      'workflow-only changes must not be grouped with package/deployable changes'
    )
  }

  if (
    /scripts\/check-github-actions-deploy\.mjs\|scripts\/check-github-actions-ci\.mjs|scripts\/check-web\*|scripts\/run-api-check\.mjs/.test(
      workflow
    )
  ) {
    violations.push(
      'local verification scripts must not be treated as deployment targets'
    )
  }

  const deployJob =
    workflow.match(/\r?\n  deploy:\r?\n[\s\S]*?\r?\n    runs-on:/)?.[0] ?? ''
  const deployJobBody =
    workflow.match(/\r?\n  deploy:\r?\n[\s\S]*?\r?\n  no-deploy:/)?.[0] ?? ''
  for (const fragment of [
    "github.event_name == 'workflow_dispatch' && inputs.mode == 'deploy-existing'",
    "needs.detect-changes.outputs.web_changed != 'true' || needs.build-web.result == 'success'",
    "needs.detect-changes.outputs.api_changed != 'true' || needs.build-api.result == 'success'",
  ]) {
    if (!deployJob.includes(fragment)) {
      violations.push(
        `deploy job must gate changed targets on successful image builds: ${fragment}`
      )
    }
  }

  if (
    deployJob.includes(
      "needs.build-web.result == 'success' || needs.build-web.result == 'skipped'"
    ) ||
    deployJob.includes(
      "needs.build-api.result == 'success' || needs.build-api.result == 'skipped'"
    )
  ) {
    violations.push(
      'deploy job must not accept a skipped image build for a changed target'
    )
  }
  if (
    !deployJobBody.includes('timeout-minutes: 60') ||
    deployJobBody.includes('timeout-minutes: 15')
  ) {
    violations.push(
      'deploy job must reserve 60 minutes for scoped DDL, candidate checks, and failure recovery'
    )
  }
}

if (deployDoc) {
  const requiredFragments = [
    'GitHub Actions',
    'LIGHTHOUSE_HOST',
    'LIGHTHOUSE_USER',
    'LIGHTHOUSE_SSH_KEY',
    'LIGHTHOUSE_PORT',
    'sun-world-frontend',
    'sun-world-api',
    'Build frontend image on Lighthouse',
    'Build API image on Lighthouse',
    'docker build',
    'schema_migration',
    'schema_mode',
    'full',
    'identity-20260829',
    'mode=deploy-existing',
    'identity_timer_ack',
    'cancel-in-progress',
    'sun-world-auto-deploy.timer',
    '/auth/methods',
    '60 minutes',
    'target=web',
    'my-frontend-identity-backup',
    'non-ignored untracked',
    'artifact',
    'current workflow run',
    'deploy/lighthouse_known_hosts',
    'frontend-runtime-<git-sha>',
    '--pull=false --network=none',
    'Tencent TCR',
    'GHCR',
    'git fetch --prune',
    'git pull --ff-only',
  ]

  for (const fragment of requiredFragments) {
    if (!deployDoc.includes(fragment)) {
      violations.push(`frontend deploy doc must contain: ${fragment}`)
    }
  }

  if (
    /ghcr\.io|ccr\.ccs\.tencentyun\.com|Tencent CCR|docker\s+(?:login|pull|save|load)\b/.test(
      deployDoc
    )
  ) {
    violations.push(
      'frontend deploy doc must describe static dist transfer and Lighthouse-local packaging without registry or Docker image archive commands'
    )
  }
}

if (
  packageJson.scripts?.['check:github-actions:deploy'] !==
  'node scripts/check-github-actions-deploy.mjs'
) {
  violations.push('root package.json must expose check:github-actions:deploy')
}

if (!checkAll.includes('check:github-actions:deploy')) {
  violations.push('root check-all must include check:github-actions:deploy')
}

if (violations.length) {
  console.error('GitHub Actions deploy protocol failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('GitHub Actions deploy protocol passed.')
