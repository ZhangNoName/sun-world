#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const appSrcDir = join(repoRoot, 'apps/web/src')
const appDistAssetsDir = join(repoRoot, 'apps/web/dist/assets')
const uiPackagePath = join(repoRoot, 'packages/ui/package.json')
const uiSrcDir = join(repoRoot, 'packages/ui/src')
const viteConfigPath = join(repoRoot, 'apps/web/vite.config.ts')
const violations = []

const allowedSubpaths = [
  'button',
  'chat-composer',
  'chat-shell',
  'date-picker',
  'input',
  'list',
  'loading-skeleton',
  'pagination',
  'tag',
  'theme-provider',
]

function normalize(path) {
  return path.split(sep).join('/')
}

function walkFiles(dir, predicate) {
  const files = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      files.push(...walkFiles(path, predicate))
    } else if (stats.isFile() && predicate(path)) {
      files.push(path)
    }
  }
  return files
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function formatPath(path) {
  return normalize(relative(repoRoot, path))
}

const appFiles = walkFiles(appSrcDir, (path) => /\.(?:ts|tsx|vue)$/.test(path))
const uiImportPattern =
  /import\s+(?:type\s+)?[\s\S]*?\s+from\s+['"](@sun-world\/ui(?:\/[^'"]*)?)['"]/g

for (const file of appFiles) {
  const source = readFileSync(file, 'utf8')
  const imports = [...source.matchAll(uiImportPattern)].map((match) => match[1])
  for (const specifier of imports) {
    if (specifier === '@sun-world/ui') {
      violations.push(
        `${formatPath(file)} imports @sun-world/ui root; app code must use component subpaths`
      )
      continue
    }

    const subpath = specifier.replace('@sun-world/ui/', '')
    if (!allowedSubpaths.includes(subpath)) {
      violations.push(
        `${formatPath(file)} imports unsupported UI path "${specifier}"; use a documented component subpath`
      )
    }
  }
}

const uiPackage = readJson(uiPackagePath)
for (const subpath of allowedSubpaths) {
  const exportKey = `./${subpath}`
  if (!uiPackage.exports?.[exportKey]) {
    violations.push(`packages/ui/package.json must export "${exportKey}"`)
  }

  const entryPath = join(uiSrcDir, `${subpath}.ts`)
  if (!existsSync(entryPath)) {
    violations.push(`packages/ui/src/${subpath}.ts is missing`)
  }
}

const viteConfigSource = readFileSync(viteConfigPath, 'utf8')
if (/packages\/ui\/src\/[\s\S]*return\s+['"]ui['"]/.test(viteConfigSource)) {
  violations.push(
    'apps/web/vite.config.ts must not force all @sun-world/ui source into one manual ui chunk'
  )
}
if (/@sun-world\/ui['"]\)\)\s*return\s+['"]ui['"]/.test(viteConfigSource)) {
  violations.push(
    'apps/web/vite.config.ts must not force @sun-world/ui package imports into one manual ui chunk'
  )
}

if (existsSync(appDistAssetsDir)) {
  const distAssetNames = readdirSync(appDistAssetsDir)
  const uiSharedAssets = distAssetNames.filter((name) =>
    /^ui\..*\.(?:js|css)$/.test(name)
  )
  if (uiSharedAssets.length > 0) {
    violations.push(
      `apps/web/dist must not contain a shared UI chunk (${uiSharedAssets.join(', ')}); component subpath imports should stay route-owned or consumer-owned`
    )
  }
}

if (violations.length) {
  console.error('UI package boundary check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('UI package boundary check passed.')
