#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')

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

for (const file of forbiddenFiles) {
  if (existsSync(resolve(repoRoot, file))) {
    violations.push(`${file} is a retired API entrypoint`)
  }
}

const rg = spawnSync(
  'rg',
  [
    '--files',
    'apps/web/src',
    '-g',
    '*.ts',
    '-g',
    '*.vue',
  ],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  }
)

if (rg.status === 0) {
  const files = rg.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

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
    const source = readFileSync(resolve(repoRoot, file), 'utf8')
    if (
      directHttpInfrastructureImportPattern.test(source) &&
      !allowedHttpInfrastructureImports.has(file.replaceAll('\\', '/'))
    ) {
      violations.push(
        `${file} imports shared HTTP infrastructure directly; use a module api.ts or shared/api boundary`
      )
    }
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(source)) {
        violations.push(`${file} matches forbidden legacy API pattern ${pattern}`)
      }
    }
  }
} else if (rg.status !== 1) {
  const output = [rg.stdout, rg.stderr].filter(Boolean).join('\n').trim()
  throw new Error(output || 'Unable to scan web source files')
}

if (violations.length) {
  console.error('Legacy API entrypoint check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Legacy API entrypoint check passed.')
