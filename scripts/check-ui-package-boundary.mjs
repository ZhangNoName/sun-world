#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const appSrcDir = join(repoRoot, 'apps/web/src')
const appDistAssetsDir = join(repoRoot, 'apps/web/dist/assets')
const basePackagePath = join(repoRoot, 'packages/base-ui/package.json')
const baseSrcDir = join(repoRoot, 'packages/base-ui/src')
const uiPackagePath = join(repoRoot, 'packages/ui/package.json')
const uiSrcDir = join(repoRoot, 'packages/ui/src')
const viteConfigPath = join(repoRoot, 'apps/web/vite.config.ts')
const violations = []

const baseSubpaths = [
  'badge',
  'button',
  'card',
  'checkbox',
  'dialog',
  'dropdown-menu',
  'field',
  'input',
  'label',
  'select',
  'separator',
  'sheet',
  'skeleton',
  'sidebar',
  'table',
  'tabs',
  'textarea',
  'tooltip',
]
const uiComponentSubpaths = [
  'loading-skeleton',
  'sonner',
  'sw-input',
  'sw-select',
  'sw-button',
  'sw-dialog',
  'sw-dropdown-menu',
  'sw-sidebar',
  'tag',
  'toast',
]
const uiPatternSubpaths = [
  'chat-composer',
  'chat-shell',
  'compound-controls',
  'date-picker',
  'form-controls',
  'list',
  'pagination',
  'theme-provider',
]
const uiSubpaths = [...uiComponentSubpaths, ...uiPatternSubpaths, 'styles.css']

function normalize(path) {
  return path.split(sep).join('/')
}

function walkFiles(dir, predicate) {
  const files = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stats = statSync(path)
    if (stats.isDirectory()) files.push(...walkFiles(path, predicate))
    else if (stats.isFile() && predicate(path)) files.push(path)
  }
  return files
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function formatPath(path) {
  return normalize(relative(repoRoot, path))
}

function checkExports(packagePath, sourceRoot, subpaths, groupFor) {
  if (!existsSync(packagePath)) {
    violations.push(`${formatPath(packagePath)} is missing`)
    return
  }
  const packageJson = readJson(packagePath)
  for (const subpath of subpaths) {
    const exportKey = `./${subpath}`
    if (!packageJson.exports?.[exportKey]) {
      violations.push(`${formatPath(packagePath)} must export "${exportKey}"`)
    }
    if (subpath === 'styles.css') continue
    const group = groupFor(subpath)
    const entryPath = join(sourceRoot, group, subpath, 'index.ts')
    if (!existsSync(entryPath)) {
      violations.push(`${formatPath(entryPath)} is missing`)
    }
  }
}

const appFiles = walkFiles(appSrcDir, (path) => /.(?:ts|tsx)$/.test(path))
const importPattern =
  /import\s+(?:type\s+)?[\s\S]*?\s+from\s+['"](@sun-world\/(?:base-ui|ui)(?:\/[^'"]*)?)['"]/g

for (const file of appFiles) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1]
    const [scope, ...rest] = specifier.split('/')
    const packageName = `${scope}/${rest.shift()}`
    const subpath = rest.join('/')
    if (!subpath) {
      violations.push(
        `${formatPath(file)} imports ${packageName} root; app code must use component subpaths`
      )
      continue
    }
    const allowed =
      packageName === '@sun-world/base-ui' ? baseSubpaths : uiSubpaths
    if (!allowed.includes(subpath)) {
      violations.push(
        `${formatPath(file)} imports unsupported UI path "${specifier}"`
      )
    }
  }
}

checkExports(basePackagePath, baseSrcDir, baseSubpaths, () => 'components')
checkExports(uiPackagePath, uiSrcDir, uiComponentSubpaths, () => 'components')
checkExports(uiPackagePath, uiSrcDir, uiPatternSubpaths, () => 'patterns')

const uiPackage = readJson(uiPackagePath)
for (const subpath of baseSubpaths) {
  if (uiPackage.exports?.[`./${subpath}`]) {
    violations.push(
      `packages/ui/package.json must not export base primitive "./${subpath}"`
    )
  }
}
if (uiPackage.dependencies?.['@sun-world/base-ui'] !== 'workspace:*') {
  violations.push(
    'packages/ui must depend on @sun-world/base-ui via workspace:*'
  )
}

const viteConfigSource = readFileSync(viteConfigPath, 'utf8')
if (!viteConfigSource.includes('createBaseUiSourceAliases')) {
  violations.push(
    'apps/web/vite.config.ts must register base-ui source aliases'
  )
}
if (/packages\/ui\/src\/[\s\S]*return\s+['"]ui['"]/.test(viteConfigSource)) {
  violations.push(
    'apps/web/vite.config.ts must not force all @sun-world/ui source into one manual ui chunk'
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
  for (const violation of violations) console.error(`- ${violation}`)
  process.exit(1)
}

console.log('UI package boundary check passed.')
