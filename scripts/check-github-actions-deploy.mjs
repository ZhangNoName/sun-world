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
    'quality:',
    'Format, checks, and unit tests',
    'timeout-minutes: 15',
    'pnpm format:check',
    'pnpm check:github-actions:ci',
    'pnpm check:github-actions:deploy',
    'detect-changes:',
    'needs: quality',
    'web_changed:',
    'api_changed:',
    'any_changed:',
    'build_needed:',
    'deploy_needed:',
    'image_tag:',
    'image_tag is required when mode=deploy-existing.',
    '.github/workflows/deploy.yml)',
    'Workflow-only changes should validate the pipeline shape but',
    'should not redeploy production images.',
    'deploy/backend/*.md|deploy/backend/**/*.md|deploy/frontend/*|deploy/frontend/**|scripts/*|scripts/**)',
    'Deployment docs and local verification scripts do not enter',
    'the production images.',
    'build-web:',
    'build-api:',
    'deploy:',
    "TENCENT_CCR_REGISTRY: ${{ vars.TENCENT_CCR_REGISTRY || 'ccr.ccs.tencentyun.com' }}",
    'FRONTEND_IMAGE_NAME: sun-world-frontend',
    'API_IMAGE_NAME: sun-world-api',
    'actions/setup-python@v5',
    "python-version: '3.11'",
    'Install API dependencies',
    'python -m pip install ./apps/api',
    'pnpm build:web',
    'pnpm build:web:manifest',
    'pnpm build:web:summary',
    'pnpm check:web',
    'pnpm check:api',
    'docker/login-action@v3',
    'vars.TENCENT_CCR_USERNAME',
    'secrets.TENCENT_CCR_PASSWORD',
    'vars.TENCENT_CCR_NAMESPACE',
    '${TENCENT_CCR_REGISTRY}/${{ vars.TENCENT_CCR_NAMESPACE }}/${FRONTEND_IMAGE_NAME}:${{ needs.detect-changes.outputs.image_tag }}',
    '${TENCENT_CCR_REGISTRY}/${{ vars.TENCENT_CCR_NAMESPACE }}/${API_IMAGE_NAME}:${{ needs.detect-changes.outputs.image_tag }}',
    'docker/build-push-action@v6',
    'push: true',
    'actions/upload-artifact@v4',
    'retention-days: 30',
    'ssh-keyscan',
    'vars.LIGHTHOUSE_HOST',
    'vars.LIGHTHOUSE_USER',
    'secrets.LIGHTHOUSE_SSH_KEY',
    'Deploy changed CCR images on Lighthouse',
    'Pull images and deploy on Lighthouse',
    'needs.detect-changes.outputs.image_tag',
    'if [ "$WEB_CHANGED" = "true" ]; then',
    'sudo docker pull "$FRONTEND_IMAGE"',
    'sudo docker rm -f my-frontend',
    'if [ "$API_CHANGED" = "true" ]; then',
    'Build and push API image',
    'api-deploy-metadata-${{ needs.detect-changes.outputs.image_tag }}',
    'sudo docker pull "$API_IMAGE"',
    'python -m src.database.mysql.schema_migration --mode apply',
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

  if (/cache-to:\s*type=gha/.test(workflow)) {
    violations.push(
      'deploy workflow must not use blocking Buildx GHA cache export'
    )
  }

  if (
    /ghcr\.io|docker save|docker load|frontend-image\.tar\.gz|api-image\.tar\.gz|actions\/download-artifact@v4|scp -i ~\/\.ssh\/sun_world_deploy_key|appleboy\/ssh-action|packages:\s*write/.test(
      workflow
    )
  ) {
    violations.push(
      'deploy workflow must use Tencent CCR push/pull, not GHCR or scp/docker-load image archives'
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
    'TENCENT_CCR_REGISTRY',
    'TENCENT_CCR_NAMESPACE',
    'TENCENT_CCR_USERNAME',
    'TENCENT_CCR_PASSWORD',
    'ccr.ccs.tencentyun.com',
    'sun-world-frontend',
    'sun-world-api',
    'docker pull',
    'schema_migration',
    'cancel-in-progress',
    'artifact',
  ]

  for (const fragment of requiredFragments) {
    if (!deployDoc.includes(fragment)) {
      violations.push(`frontend deploy doc must contain: ${fragment}`)
    }
  }

  if (/GHCR|ghcr\.io|docker login ghcr\.io|docker load|scp/.test(deployDoc)) {
    violations.push(
      'frontend deploy doc must describe the Tencent CCR push/pull deploy path, not GHCR or scp/docker-load image archives'
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
