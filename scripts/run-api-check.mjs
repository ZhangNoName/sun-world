#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const scripts = [
  { script: resolve(repoRoot, 'scripts/check-api-migration.py'), args: [] },
  {
    script: resolve(
      repoRoot,
      'apps/api/src/database/mysql/schema_migration.py'
    ),
    args: ['--mode', 'check'],
  },
  {
    script: resolve(repoRoot, 'scripts/check-api-schema-config-path.py'),
    args: [],
  },
  { script: resolve(repoRoot, 'scripts/check-llm-config-env.py'), args: [] },
  { script: resolve(repoRoot, 'scripts/check-api-schema-types.py'), args: [] },
  { script: resolve(repoRoot, 'scripts/check-admin-alerts.py'), args: [] },
  {
    script: resolve(repoRoot, 'scripts/check-admin-metrics-history.py'),
    args: [],
  },
  { script: resolve(repoRoot, 'scripts/check-metrics-alerts.py'), args: [] },
  { script: resolve(repoRoot, 'scripts/check-metrics-store.py'), args: [] },
  { script: resolve(repoRoot, 'scripts/check-request-metrics.py'), args: [] },
  { script: resolve(repoRoot, 'scripts/check-rum-metrics.py'), args: [] },
]

const candidates = [
  process.env.SUN_WORLD_API_PYTHON,
  process.platform === 'win32'
    ? resolve(repoRoot, 'apps/api/.venv/Scripts/python.exe')
    : resolve(repoRoot, 'apps/api/.venv/bin/python'),
  'python',
  'python3',
].filter(Boolean)

let lastError = ''

for (const candidate of candidates) {
  const isPath = candidate.includes('/') || candidate.includes('\\')
  if (isPath && !existsSync(candidate)) continue

  let failed = false
  for (const check of scripts) {
    const result = spawnSync(candidate, [check.script, ...check.args], {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32' && !isPath,
    })

    if (result.error) {
      lastError = result.error.message
      failed = true
      break
    }

    if ((result.status ?? 1) !== 0) {
      process.exit(result.status ?? 1)
    }
  }

  if (failed) continue
  process.exit(0)
}

console.error(
  `Unable to find a Python interpreter for API checks. ${lastError}`
)
process.exit(1)
