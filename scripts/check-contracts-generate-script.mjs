#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const contractsPackagePath = join(repoRoot, 'packages/contracts/package.json')
const generateScriptPath = join(repoRoot, 'scripts/generate-openapi.mjs')
const packageJson = JSON.parse(readFileSync(contractsPackagePath, 'utf8'))
const scripts = packageJson.scripts ?? {}
const violations = []

if (scripts['generate:openapi'] !== 'node ../../scripts/generate-openapi.mjs') {
  violations.push(
    '@sun-world/contracts generate:openapi must use node ../../scripts/generate-openapi.mjs'
  )
}

for (const [name, command] of Object.entries(scripts)) {
  if (name.startsWith('generate') && /\bbash\b/.test(String(command))) {
    violations.push(`@sun-world/contracts ${name} script must not depend on bash`)
  }
}

if (!existsSync(generateScriptPath)) {
  violations.push('scripts/generate-openapi.mjs must exist')
}

if (violations.length) {
  console.error('Contracts generate script check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Contracts generate script check passed.')
