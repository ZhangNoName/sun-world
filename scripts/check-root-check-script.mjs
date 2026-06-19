#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const packageJson = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const violations = []
const rootCheck = packageJson.scripts?.check ?? ''

if (rootCheck !== 'node scripts/check-all.mjs') {
  violations.push('root package.json check script must be node scripts/check-all.mjs')
}

for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (name.startsWith('check') && /\bbash\b/.test(String(command))) {
    violations.push(`check script ${name} must not depend on bash`)
  }
}

if (violations.length) {
  console.error('Root check script protocol failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Root check script protocol passed.')
