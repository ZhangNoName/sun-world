#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workflowPath = join(repoRoot, '.github', 'workflows', 'deploy.yml')
const deployDocPath = join(repoRoot, 'deploy', 'frontend', 'README.md')
const checkAllPath = join(repoRoot, 'scripts', 'check-all.mjs')
const packageJsonPath = join(repoRoot, 'package.json')
const violations = []

if (!existsSync(workflowPath)) {
  violations.push('.github/workflows/deploy.yml must exist')
}

const workflow = existsSync(workflowPath)
  ? readFileSync(workflowPath, 'utf8')
  : ''
const deployDoc = existsSync(deployDocPath)
  ? readFileSync(deployDocPath, 'utf8')
  : ''
const checkAll = existsSync(checkAllPath)
  ? readFileSync(checkAllPath, 'utf8')
  : ''
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

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
    'image_tag:',
    'concurrency:',
    'deploy-sun-world-production',
    'cancel-in-progress: true',
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
    'image_tag is required when mode=deploy-existing.',
    'github.event_name }}" = "pull_request"',
    'github.event.pull_request.base.sha',
    'build_needed=false',
    'deploy_needed=false',
    '.github/workflows/deploy.yml)',
    'Workflow-only changes should validate the pipeline shape but',
    'should not redeploy production images.',
    'deploy/backend/*.md|deploy/backend/**/*.md|deploy/frontend/*|deploy/frontend/**|scripts/*|scripts/**)',
    'Deployment docs and local verification scripts do not enter',
    'the production images.',
    'build-web:',
    'build-api:',
    'deploy:',
    'FRONTEND_IMAGE_NAME: sun-world-frontend',
    'API_IMAGE_NAME: sun-world-api',
    'actions/setup-python@v5',
    "python-version: '3.11'",
    'Install API dependencies',
    'python -m pip install ./apps/api',
    'pnpm check:web',
    'pnpm check:api',
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
    'ssh-keyscan',
    'vars.LIGHTHOUSE_HOST',
    'vars.LIGHTHOUSE_USER',
    'secrets.LIGHTHOUSE_SSH_KEY',
    'LOCK_FILE="/tmp/sun-world-docker-build.lock"',
    'flock 9',
    'sudo docker build --progress=plain',
    '-t "$FRONTEND_IMAGE"',
    '--build-arg VITE_BASE_URL="$VITE_BASE_URL"',
    '--build-arg VITE_TELEMETRY_ENDPOINT="$VITE_TELEMETRY_ENDPOINT"',
    '-f Dockerfile .',
    'Build API image on Lighthouse',
    'ServerAliveInterval=30',
    'ServerAliveCountMax=10',
    'sudo docker build --progress=plain -t "$API_IMAGE" -f apps/api/Dockerfile apps/api',
    'Deploy changed services on Lighthouse',
    'Deploy local images on Lighthouse',
    'needs.detect-changes.outputs.image_tag',
    'if [ "$WEB_CHANGED" = "true" ]; then',
    'sudo docker image inspect "$FRONTEND_IMAGE"',
    'sudo docker rm -f my-frontend',
    'if [ "$API_CHANGED" = "true" ]; then',
    'api-deploy-metadata-${{ needs.detect-changes.outputs.image_tag }}',
    'sudo docker image inspect "$API_IMAGE"',
    'python -m src.database.mysql.schema_migration --mode apply',
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
      'frontend and API images must be built on Lighthouse, not pushed from GitHub Buildx'
    )
  }

  if (/docker run -d --rm --name sun-world-api-candidate/.test(workflow)) {
    violations.push(
      'candidate API container must not use --rm so failed health checks can print logs before cleanup'
    )
  }

  if (
    /ghcr\.io|ccr\.ccs\.tencentyun\.com|TENCENT_CCR|docker pull|docker save|docker load|frontend-image\.tar\.gz|api-image\.tar\.gz|actions\/download-artifact@v4|scp -i ~\/\.ssh\/sun_world_deploy_key|appleboy\/ssh-action|packages:\s*write/.test(
      workflow
    )
  ) {
    violations.push(
      'deploy workflow must use Lighthouse-local Docker images, not registry push/pull or archive transfer'
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
    'cancel-in-progress',
    'artifact',
  ]

  for (const fragment of requiredFragments) {
    if (!deployDoc.includes(fragment)) {
      violations.push(`frontend deploy doc must contain: ${fragment}`)
    }
  }

  if (
    /GHCR|ghcr\.io|ccr\.ccs\.tencentyun\.com|Tencent CCR|docker login ghcr\.io|docker pull|docker load|scp/.test(
      deployDoc
    )
  ) {
    violations.push(
      'frontend deploy doc must describe the Lighthouse-local image deploy path, not registry push/pull or archive transfer'
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
