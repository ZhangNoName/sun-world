#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workflowPath = join(repoRoot, '.github', 'workflows', 'deploy-frontend.yml')
const deployDocPath = join(repoRoot, 'deploy', 'frontend', 'README.md')
const checkAllPath = join(repoRoot, 'scripts', 'check-all.mjs')
const packageJsonPath = join(repoRoot, 'package.json')
const violations = []

if (!existsSync(workflowPath)) {
  violations.push('.github/workflows/deploy-frontend.yml must exist')
}

const workflow = existsSync(workflowPath) ? readFileSync(workflowPath, 'utf8') : ''
const deployDoc = existsSync(deployDocPath) ? readFileSync(deployDocPath, 'utf8') : ''
const checkAll = existsSync(checkAllPath) ? readFileSync(checkAllPath, 'utf8') : ''
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

if (workflow) {
  const requiredFragments = [
    'name: Deploy Frontend',
    'workflow_dispatch:',
    "if: github.ref == 'refs/heads/main'",
    'branches:',
    '- main',
    'concurrency:',
    'cancel-in-progress: true',
    'permissions:',
    'packages: write',
    'contents: read',
    'detect-changes:',
    'web_changed:',
    'api_changed:',
    'any_changed:',
    'build-web:',
    'build-api:',
    'deploy:',
    'ghcr.io/zhangnoname/sun-world-frontend',
    'ghcr.io/zhangnoname/sun-world-api',
    'TCR_REGISTRY',
    'TCR_FRONTEND_IMAGE_NAME',
    'TCR_API_IMAGE_NAME',
    'secrets.TCR_USERNAME',
    'secrets.TCR_PASSWORD',
    'actions/setup-python@v5',
    'python-version: "3.11"',
    'Install API dependencies',
    'python -m pip install ./apps/api',
    'docker/login-action@v4',
    'docker/build-push-action@v6',
    'actions/upload-artifact@v4',
    'retention-days: 30',
    'appleboy/ssh-action@v1',
    'timeout-minutes: 120',
    'command_timeout: 90m',
    'vars.LIGHTHOUSE_HOST',
    'vars.LIGHTHOUSE_USER',
    'secrets.LIGHTHOUSE_SSH_KEY',
    'if [ "$WEB_CHANGED" = "true" ]; then',
    'sudo docker pull "$FRONTEND_IMAGE"',
    'sudo docker rm -f my-frontend',
    'if [ "$API_CHANGED" = "true" ]; then',
    'Build and push API image',
    'api-deploy-metadata-${{ github.sha }}',
    'python -m src.database.mysql.schema_migration --mode apply',
    'curl -fsSI https://sunworld.site',
    'curl -fsSI https://www.sunworld.site',
  ]

  for (const fragment of requiredFragments) {
    if (!workflow.includes(fragment)) {
      violations.push(`deploy workflow must contain: ${fragment}`)
    }
  }

  if (/docker compose --profile api up|systemctl restart blog-api\.service|-p 8000:8000/.test(workflow)) {
    violations.push('deploy workflow must not cut over the backend service before approval')
  }

  if (/cache-to:\s*type=gha/.test(workflow)) {
    violations.push('deploy workflow must not use blocking Buildx GHA cache export')
  }
}

if (deployDoc) {
  const requiredFragments = [
    'GitHub Actions',
    'GHCR',
    'LIGHTHOUSE_HOST',
    'LIGHTHOUSE_USER',
    'LIGHTHOUSE_SSH_KEY',
    'LIGHTHOUSE_PORT',
    'TCR_REGISTRY',
    'TCR_USERNAME',
    'TCR_PASSWORD',
    'TCR_FRONTEND_IMAGE_NAME',
    'TCR_API_IMAGE_NAME',
    'sun-world-frontend',
    'sun-world-api',
    'schema_migration',
    'cancel-in-progress',
    'artifact',
  ]

  for (const fragment of requiredFragments) {
    if (!deployDoc.includes(fragment)) {
      violations.push(`frontend deploy doc must contain: ${fragment}`)
    }
  }
}

if (packageJson.scripts?.['check:github-actions:deploy'] !== 'node scripts/check-github-actions-deploy.mjs') {
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
