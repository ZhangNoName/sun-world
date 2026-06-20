#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const packageJson = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8')
)
const checkAllSource = readText('scripts/check-all.mjs')
const roadmap = readText('docs/architecture/platform-iteration-roadmap.md')
const currentState = readText('docs/current-state.md')
const handoff = readText('docs/agent-handoff.md')
const violations = []

function readText(path) {
  const absolutePath = join(repoRoot, path)
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : ''
}

function requireFile(path, reason) {
  if (!existsSync(join(repoRoot, path))) {
    violations.push(`missing ${path}: ${reason}`)
  }
}

function requireScript(name, expected) {
  if (packageJson.scripts?.[name] !== expected) {
    violations.push(`package script ${name} must be "${expected}"`)
  }
}

function requireText(label, source, pattern, reason) {
  if (!pattern.test(source)) {
    violations.push(`${label} must mention ${reason}`)
  }
}

requireScript('check:platform', 'node scripts/check-platform-goal-audit.mjs')
requireScript('check:web', 'node scripts/check-web.mjs')
requireScript('check:api', 'node scripts/run-api-check.mjs')
requireScript(
  'check:contracts:generate',
  'node scripts/check-contracts-generate-script.mjs'
)
requireScript(
  'check:web:ui-boundary',
  'node scripts/check-ui-package-boundary.mjs'
)
requireScript(
  'check:compose',
  'node scripts/check-docker-build-context.mjs && node scripts/check-api-dockerfile-cache.mjs && node scripts/verify-compose.mjs'
)
requireText(
  'scripts/check-all.mjs',
  checkAllSource,
  /check:platform/,
  'the platform goal audit in the root check chain'
)
requireText(
  'scripts/check-all.mjs',
  checkAllSource,
  /test:ui/,
  'the UI package test command in the root check chain'
)
requireText(
  'scripts/check-all.mjs',
  checkAllSource,
  /build:ui/,
  'the UI package build command in the root check chain'
)

const requiredFiles = [
  [
    'docs/architecture/platform-iteration-roadmap.md',
    'iteration plan and commit policy',
  ],
  [
    'docs/architecture/observability-and-analytics.md',
    'monitoring platform design',
  ],
  [
    'docs/architecture/frontend-ui-component-prd.md',
    'UI component protocol PRD',
  ],
  ['docker-compose.yml', 'one-command build/deploy composition candidate'],
  ['packages/ui/package.json', 'independently packaged UI library'],
  ['packages/contracts/src/routes.ts', 'shared route constants'],
  ['packages/contracts/src/index.spec.ts', 'contract drift tests'],
  ['scripts/generate-openapi.mjs', 'cross-platform OpenAPI export wrapper'],
  [
    'scripts/check-contracts-generate-script.mjs',
    'cross-platform contract generation guard',
  ],
  ['apps/api/src/core/metrics.py', 'backend request metrics'],
  ['apps/api/src/core/admin_alerts.py', 'admin alert read model assembly'],
  ['apps/api/src/core/metrics_history.py', 'admin metrics history read model'],
  ['apps/api/src/core/metrics_alerts.py', 'backend metrics alert thresholds'],
  ['apps/api/src/core/rum_metrics.py', 'RUM metrics collector'],
  [
    'apps/api/src/core/metrics_store.py',
    'replaceable metrics persistence boundary',
  ],
  ['scripts/check-admin-alerts.py', 'admin alert protocol check'],
  [
    'scripts/check-admin-metrics-history.py',
    'admin metrics history protocol check',
  ],
  ['apps/web/src/shared/telemetry/index.ts', 'frontend telemetry client'],
  ['scripts/check-web.mjs', 'cross-platform frontend verification'],
  ['scripts/run-api-check.mjs', 'cross-platform backend verification'],
  ['scripts/check-all.mjs', 'cross-platform root verification'],
  ['scripts/generate-web-build-manifest.mjs', 'bundle manifest generation'],
  ['scripts/check-web-build-manifest.mjs', 'bundle manifest protocol check'],
  ['scripts/generate-web-build-summary.mjs', 'bundle summary generation'],
  ['scripts/check-web-build-summary.mjs', 'bundle summary protocol check'],
  [
    'scripts/check-ui-package-boundary.mjs',
    'UI package subpath and bundle boundary check',
  ],
]

for (const [path, reason] of requiredFiles) {
  requireFile(path, reason)
}

requireText(
  'platform roadmap',
  roadmap,
  /Do not commit and push after every tiny edit/,
  'the commit/push cadence decision'
)
requireText(
  'platform roadmap',
  roadmap,
  /Vue modules[\s\S]*@sun-world\/contracts[\s\S]*FastAPI routers/,
  'the frontend-backend request chain'
)
requireText(
  'platform roadmap',
  roadmap,
  /Performance Monitoring Platform/,
  'the monitoring platform section'
)
requireText(
  'platform roadmap',
  roadmap,
  /Build, Runtime, And Packaging/,
  'the build/runtime/package optimization section'
)
requireText(
  'platform roadmap',
  roadmap,
  /SSR is not required now/,
  'the SSR decision'
)
requireText(
  'current state',
  currentState,
  /P1\.80/,
  'the latest verified checkpoint marker'
)
requireText(
  'handoff',
  handoff,
  /P1\.80 lazy AI manager startup/,
  'the latest handoff checkpoint'
)
if (violations.length) {
  console.error('Platform goal audit failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Platform goal audit passed.')
