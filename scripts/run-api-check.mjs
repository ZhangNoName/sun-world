#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const scripts = [
  resolve(repoRoot, 'scripts/check-api-migration.py'),
  resolve(repoRoot, 'scripts/check-admin-alerts.py'),
  resolve(repoRoot, 'scripts/check-admin-metrics-history.py'),
  resolve(repoRoot, 'scripts/check-metrics-alerts.py'),
  resolve(repoRoot, 'scripts/check-metrics-store.py'),
  resolve(repoRoot, 'scripts/check-request-metrics.py'),
  resolve(repoRoot, 'scripts/check-rum-metrics.py'),
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
  for (const script of scripts) {
    const result = spawnSync(candidate, [script], {
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

console.error(`Unable to find a Python interpreter for API checks. ${lastError}`)
process.exit(1)
