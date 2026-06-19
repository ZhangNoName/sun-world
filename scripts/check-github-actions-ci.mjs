#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workflowPath = join(repoRoot, '.github', 'workflows', 'ci.yml')
const prettierConfigPath = join(repoRoot, '.prettierrc.json')
const prettierIgnorePath = join(repoRoot, '.prettierignore')
const packageJsonPath = join(repoRoot, 'package.json')
const violations = []

if (!existsSync(workflowPath)) {
  violations.push('.github/workflows/ci.yml must exist')
}

if (!existsSync(prettierConfigPath)) {
  violations.push('.prettierrc.json must exist')
}

if (!existsSync(prettierIgnorePath)) {
  violations.push('.prettierignore must exist')
}

const workflow = existsSync(workflowPath)
  ? readFileSync(workflowPath, 'utf8')
  : ''
const prettierIgnore = existsSync(prettierIgnorePath)
  ? readFileSync(prettierIgnorePath, 'utf8')
  : ''
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

if (workflow) {
  const requiredFragments = [
    'name: CI',
    'pull_request:',
    'branches:',
    '- main',
    'workflow_dispatch:',
    'concurrency:',
    'cancel-in-progress: true',
    'permissions:',
    'contents: read',
    'fetch-depth: 0',
    'pnpm/action-setup@v4',
    'actions/setup-node@v4',
    'node-version: 22',
    'actions/setup-python@v5',
    "python-version: '3.11'",
    'pnpm install --frozen-lockfile',
    'python -m pip install ./apps/api',
    'PRETTIER_BASE_REF: ${{ github.event.before }}',
    'pnpm format:check',
    'pnpm check:github-actions:ci',
    'pnpm check:github-actions:deploy',
    'pnpm check:web',
    'pnpm check:api',
    'pnpm test:ui',
    'pnpm test:contracts',
  ]

  for (const fragment of requiredFragments) {
    if (!workflow.includes(fragment)) {
      violations.push(`CI workflow must contain: ${fragment}`)
    }
  }

  if (
    /appleboy\/ssh-action|docker\/build-push-action|docker login|sudo docker/.test(
      workflow
    )
  ) {
    violations.push(
      'CI workflow must not deploy, push images, or contact the server'
    )
  }
}

if (packageJson.scripts?.format !== 'node scripts/format-changed.mjs --write') {
  violations.push(
    'root package.json must expose format through scripts/format-changed.mjs'
  )
}

if (
  packageJson.scripts?.['format:check'] !==
  'node scripts/format-changed.mjs --check'
) {
  violations.push(
    'root package.json must expose format:check through scripts/format-changed.mjs'
  )
}

if (!existsSync(join(repoRoot, 'scripts', 'format-changed.mjs'))) {
  violations.push('scripts/format-changed.mjs must exist')
}

if (
  packageJson.scripts?.['check:github-actions:ci'] !==
  'node scripts/check-github-actions-ci.mjs'
) {
  violations.push('root package.json must expose check:github-actions:ci')
}

if (!packageJson.devDependencies?.prettier) {
  violations.push('root package.json must include Prettier as a dev dependency')
}

for (const ignored of [
  '*.md',
  '*.py',
  'pnpm-lock.yaml',
  'apps/web/dist',
  'apps/api/.venv',
]) {
  if (!prettierIgnore.includes(ignored)) {
    violations.push(`.prettierignore must contain: ${ignored}`)
  }
}

if (violations.length) {
  console.error('GitHub Actions CI protocol failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('GitHub Actions CI protocol passed.')
