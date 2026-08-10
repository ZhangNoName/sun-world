#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const httpPath = resolve(repoRoot, 'apps/web/src/service/http.ts')
const source = readFileSync(httpPath, 'utf8')

const forbiddenImports = [/from\s+['"]@\/store\//, /from\s+['"]@\/modules\//]

for (const pattern of forbiddenImports) {
  if (pattern.test(source)) {
    console.error(
      'HTTP transport must receive session behavior through the shared SessionPort.'
    )
    process.exit(1)
  }
}

if (!source.includes('@/shared/api/sessionPort')) {
  console.error('HTTP transport must use the shared SessionPort.')
  process.exit(1)
}

console.log('Web session boundary check passed.')
