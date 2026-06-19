#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workflowPath = join(repoRoot, '.github', 'workflows', 'deploy-frontend.yml')
const deployDocPath = join(repoRoot, 'deploy', 'frontend', 'README.md')
const packageJsonPath = join(repoRoot, 'package.json')
const violations = []

if (!existsSync(workflowPath)) {
  violations.push('.github/workflows/deploy-frontend.yml must exist')
}

const workflow = existsSync(workflowPath) ? readFileSync(workflowPath, 'utf8') : ''
const deployDoc = existsSync(deployDocPath) ? readFileSync(deployDocPath, 'utf8') : ''
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
    'ghcr.io/zhangnoname/sun-world-frontend',
    'docker/login-action@v4',
    'docker/build-push-action@v6',
    'actions/upload-artifact@v4',
    'retention-days: 30',
    'appleboy/ssh-action@v1',
    'vars.LIGHTHOUSE_HOST',
    'vars.LIGHTHOUSE_USER',
    'secrets.LIGHTHOUSE_SSH_KEY',
    'docker pull "$IMAGE"',
    'docker rm -f my-frontend',
    'curl -fsSI https://sunworld.site',
    'curl -fsSI https://www.sunworld.site',
  ]

  for (const fragment of requiredFragments) {
    if (!workflow.includes(fragment)) {
      violations.push(`deploy workflow must contain: ${fragment}`)
    }
  }

  if (/--profile api|sun-world-api|blog-api\.service/.test(workflow)) {
    violations.push('deploy workflow must not deploy the backend before cutover')
  }
}

if (deployDoc) {
  const requiredFragments = [
    'GitHub Actions',
    'GHCR',
    'LIGHTHOUSE_HOST',
    'LIGHTHOUSE_USER',
    'LIGHTHOUSE_SSH_KEY',
    'sun-world-frontend',
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

if (violations.length) {
  console.error('GitHub Actions deploy protocol failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('GitHub Actions deploy protocol passed.')
