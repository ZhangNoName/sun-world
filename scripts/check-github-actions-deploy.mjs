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
    'workflow_dispatch:',
    "if: github.ref == 'refs/heads/main'",
    'branches:',
    '- main',
    'paths-ignore:',
    "- '**/*.md'",
    "- 'docs/**'",
    'concurrency:',
    'group: deploy-${{ github.ref }}',
    'cancel-in-progress: true',
    'permissions:',
    'contents: read',
    'detect-changes:',
    'web_changed:',
    'api_changed:',
    'any_changed:',
    '.github/workflows/deploy.yml|.github/workflows/ci.yml)',
    'Workflow-only changes should validate the pipeline shape but',
    'should not redeploy production images.',
    'build-web:',
    'build-api:',
    'deploy:',
    'FRONTEND_IMAGE_NAME: sun-world-frontend',
    'API_IMAGE_NAME: sun-world-api',
    'actions/setup-python@v5',
    "python-version: '3.11'",
    'Install API dependencies',
    'python -m pip install ./apps/api',
    'docker/build-push-action@v6',
    'load: true',
    'docker save',
    'frontend-image.tar.gz',
    'api-image.tar.gz',
    'actions/upload-artifact@v4',
    'actions/download-artifact@v4',
    'retention-days: 30',
    'timeout-minutes: 45',
    'ssh-keyscan',
    'scp -i ~/.ssh/sun_world_deploy_key',
    'vars.LIGHTHOUSE_HOST',
    'vars.LIGHTHOUSE_USER',
    'secrets.LIGHTHOUSE_SSH_KEY',
    'Deploy changed image artifacts on Lighthouse',
    'if [ "$WEB_CHANGED" = "true" ]; then',
    'sudo docker load -i "$REMOTE_RELEASE_DIR/frontend-image.tar.gz"',
    'sudo docker rm -f my-frontend',
    'if [ "$API_CHANGED" = "true" ]; then',
    'Build API image artifact',
    'api-deploy-metadata-${{ github.sha }}',
    'sudo docker load -i "$REMOTE_RELEASE_DIR/api-image.tar.gz"',
    'python -m src.database.mysql.schema_migration --mode apply',
    'curl -fsSI https://sunworld.site',
    'curl -fsSI https://www.sunworld.site',
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
    /ghcr\.io|TCR_|docker\/login-action|docker login|docker pull|appleboy\/ssh-action|packages:\s*write/.test(
      workflow
    )
  ) {
    violations.push(
      'deploy workflow must not depend on registry push/pull for application images'
    )
  }

  if (
    /\.github\/workflows\/deploy\.yml\|\.github\/workflows\/ci\.yml\|package\.json/.test(
      workflow
    )
  ) {
    violations.push(
      'workflow-only changes must not be grouped with package/deployable changes'
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
    'docker load',
    'scp',
    'schema_migration',
    'cancel-in-progress',
    'artifact',
  ]

  for (const fragment of requiredFragments) {
    if (!deployDoc.includes(fragment)) {
      violations.push(`frontend deploy doc must contain: ${fragment}`)
    }
  }

  if (/GHCR|ghcr\.io|TCR_|TCR|docker login ghcr\.io/.test(deployDoc)) {
    violations.push(
      'frontend deploy doc must describe the artifact/scp deploy path, not GHCR/TCR'
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
