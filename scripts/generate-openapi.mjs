#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const exportScript = resolve(repoRoot, 'scripts/export-openapi.py')
const scriptArgs = process.argv.slice(2)

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

  const result = spawnSync(candidate, [exportScript, ...scriptArgs], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32' && !isPath,
  })

  if (result.error) {
    lastError = result.error.message
    continue
  }

  process.exit(result.status ?? 1)
}

console.error(`Unable to find a Python interpreter for OpenAPI export. ${lastError}`)
process.exit(1)
