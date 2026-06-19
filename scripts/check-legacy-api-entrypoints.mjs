#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const webSourceRoot = resolve(repoRoot, 'apps/web/src')

const allowedHttpInfrastructureImports = new Set([
  'apps/web/src/service/http.ts',
  'apps/web/src/shared/api/index.ts',
])

const forbiddenFiles = [
  'apps/web/src/service/request.ts',
  'apps/web/src/service/auth.req.ts',
  'apps/web/src/service/manageRequest.ts',
  'apps/web/src/service/user.req.ts',
  'apps/web/src/hooks/auth/auth.ts',
  'apps/web/src/aigc/ai.func.ts',
  'apps/web/src/aigc/AIGC.class.ts',
  'apps/web/src/aigc/openai_langchian.ts',
  'apps/web/src/aigc/index.ts',
]

const violations = []

function listSourceFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(abs))
    } else if (entry.isFile() && /\.(ts|vue)$/.test(entry.name)) {
      files.push(abs)
    }
  }
  return files
}

for (const file of forbiddenFiles) {
  if (existsSync(resolve(repoRoot, file))) {
    violations.push(`${file} is a retired API entrypoint`)
  }
}

const files = listSourceFiles(webSourceRoot)

const forbiddenPatterns = [
  /@\/service\/request/,
  /service\/request/,
  /@\/service\/auth\.req/,
  /service\/auth\.req/,
  /@\/service\/manageRequest/,
  /service\/manageRequest/,
  /@\/service\/user\.req/,
  /service\/user\.req/,
  /@\/hooks\/auth/,
  /hooks\/auth/,
  /@\/aigc/,
  /axios\.post\(\s*['"]\/api\/refresh['"]/,
]
const directHttpInfrastructureImportPattern = /@\/service\/http|service\/http/

for (const file of files) {
  const source = readFileSync(file, 'utf8')
  const normalizedFile = file.replace(repoRoot, '').replace(/^[/\\]/, '').replaceAll('\\', '/')
  if (
    directHttpInfrastructureImportPattern.test(source) &&
    !allowedHttpInfrastructureImports.has(normalizedFile)
  ) {
    violations.push(
      `${normalizedFile} imports shared HTTP infrastructure directly; use a module api.ts or shared/api boundary`
    )
  }
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push(`${normalizedFile} matches forbidden legacy API pattern ${pattern}`)
    }
  }
}

if (violations.length) {
  console.error('Legacy API entrypoint check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Legacy API entrypoint check passed.')
