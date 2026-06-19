#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const modulesRoot = resolve(repoRoot, 'apps/web/src/modules')

function listApiFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listApiFiles(abs))
    } else if (entry.isFile() && entry.name === 'api.ts') {
      files.push(abs)
    }
  }
  return files
}

const apiFiles = listApiFiles(modulesRoot)

if (!apiFiles.length) {
  throw new Error('Unable to list module API files')
}

const directRoutePattern =
  /\bapi(?:Get|Post|Put|Delete|Patch)\(\s*(['"])(\/(?:admin|ai|auth|base|blogs|healthz|readyz|telemetry|user)[^'"]*)\1/g

const violations = []

for (const file of apiFiles) {
  const source = readFileSync(file, 'utf8')
  let match
  while ((match = directRoutePattern.exec(source)) !== null) {
    const line = source.slice(0, match.index).split(/\r?\n/).length
    violations.push(`${relative(repoRoot, file)}:${line} uses direct API route ${match[2]}`)
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
