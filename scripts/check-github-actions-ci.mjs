#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const workflowPath = join(repoRoot, '.github', 'workflows', 'deploy.yml')
const prettierConfigPath = join(repoRoot, '.prettierrc.json')
const prettierIgnorePath = join(repoRoot, '.prettierignore')
const nvmrcPath = join(repoRoot, '.nvmrc')
const packageJsonPath = join(repoRoot, 'package.json')
const violations = []
const NODE_VERSION = '24.17.0'
const PNPM_VERSION = '10.15.1'

if (!existsSync(workflowPath)) {
  violations.push('.github/workflows/deploy.yml must exist')
}

if (!existsSync(prettierConfigPath)) {
  violations.push('.prettierrc.json must exist')
}

if (!existsSync(prettierIgnorePath)) {
  violations.push('.prettierignore must exist')
}

if (!existsSync(nvmrcPath)) {
  violations.push('.nvmrc must exist')
}

const workflow = existsSync(workflowPath)
  ? readFileSync(workflowPath, 'utf8')
  : ''
const prettierIgnore = existsSync(prettierIgnorePath)
  ? readFileSync(prettierIgnorePath, 'utf8')
  : ''
const nvmrc = existsSync(nvmrcPath)
  ? readFileSync(nvmrcPath, 'utf8').trim()
  : ''
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

if (workflow) {
  const requiredFragments = [
    'name: Deploy Sun World',
    'pull_request:',
    'branches:',
    '- main',
    'paths-ignore:',
    "- '**/*.md'",
    "- 'docs/**'",
    'workflow_dispatch:',
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
    'needs: detect-changes',
    "needs.detect-changes.outputs.web_changed == 'true'",
    "needs.detect-changes.outputs.api_changed == 'true'",
    'github.event_name }}" = "pull_request"',
    'timeout-minutes: 15',
    'fetch-depth: 0',
    'pnpm/action-setup@v4',
    'actions/setup-node@v4',
    `node-version: ${NODE_VERSION}`,
    `version: ${PNPM_VERSION}`,
    'actions/setup-python@v5',
    "python-version: '3.11'",
    'pnpm install --frozen-lockfile',
    'python -m pip install ./apps/api',
    "PRETTIER_BASE_REF: ${{ github.event_name == 'pull_request' && github.event.pull_request.base.sha || github.event.before }}",
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
      violations.push(`Deploy pipeline quality job must contain: ${fragment}`)
    }
  }
}

if (packageJson.scripts?.format !== 'node scripts/format-changed.mjs --write') {
  violations.push(
    'root package.json must expose format through scripts/format-changed.mjs'
  )
}

if (nvmrc !== NODE_VERSION) {
  violations.push(`.nvmrc must pin the project to Node ${NODE_VERSION}`)
}

if (packageJson.engines?.node !== NODE_VERSION) {
  violations.push(`root package.json engines.node must be ${NODE_VERSION}`)
}

if (packageJson.engines?.pnpm !== PNPM_VERSION) {
  violations.push(`root package.json engines.pnpm must be ${PNPM_VERSION}`)
}

if (packageJson.packageManager !== `pnpm@${PNPM_VERSION}`) {
  violations.push(
    `root package.json packageManager must be pnpm@${PNPM_VERSION}`
  )
}

if (packageJson.devDependencies?.['@types/node'] !== '^24.9.2') {
  violations.push('root package.json must use @types/node ^24.9.2')
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
