#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')

const rg = spawnSync(
  'rg',
  ['--files', 'apps/web/src/modules', '-g', 'api.ts'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }
)

if (rg.status !== 0) {
  const output = [rg.stdout, rg.stderr].filter(Boolean).join('\n').trim()
  throw new Error(output || 'Unable to list module API files')
}

const apiFiles = rg.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)

const directRoutePattern =
  /\bapi(?:Get|Post|Put|Delete|Patch)\(\s*(['"])(\/(?:admin|ai|auth|base|blogs|healthz|readyz|telemetry|user)[^'"]*)\1/g

const violations = []

for (const file of apiFiles) {
  const abs = resolve(repoRoot, file)
  const source = readFileSync(abs, 'utf8')
  let match
  while ((match = directRoutePattern.exec(source)) !== null) {
    const line = source.slice(0, match.index).split(/\r?\n/).length
    violations.push(`${relative(repoRoot, abs)}:${line} uses direct API route ${match[2]}`)
  }
}

if (violations.length) {
  console.error('Module API files must use API_ROUTES from @sun-world/contracts:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Contract route usage check passed.')
