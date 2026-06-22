#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const appSrcDir = join(repoRoot, 'apps/web/src')
const iconsPackagePath = join(repoRoot, 'packages/icons/package.json')
const uiDataPath = join(repoRoot, 'packages/icons/src/data/ui.ts')
const noticePath = join(repoRoot, 'packages/icons/NOTICE.md')
const viteConfigPath = join(repoRoot, 'apps/web/vite.config.ts')
const violations = []
const allowedRootIconImports = new Set([
  'QQOutlined',
  'GithubOutlined',
  'WeChatOutLined',
  'CommentSvg',
  'HandSvg',
  'RectSvg',
  'SelectSvg',
])

function normalize(path) {
  return path.split(sep).join('/')
}

function formatPath(path) {
  return normalize(relative(repoRoot, path))
}

function walkFiles(dir, predicate) {
  if (!existsSync(dir)) return []

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

const appRuntimeFiles = walkFiles(appSrcDir, (path) =>
  /\.(?:ts|tsx|vue)$/.test(path)
)

for (const file of appRuntimeFiles) {
  const source = readFileSync(file, 'utf8')
  if (source.includes('lucide-vue-next')) {
    violations.push(
      `${formatPath(file)} imports lucide-vue-next directly; use @sun-world/icons instead`
    )
  }
  if (/<svg\b/.test(source)) {
    violations.push(
      `${formatPath(file)} contains inline SVG; move UI icons into @sun-world/icons data`
    )
  }
  if (source.includes('virtual:svg-icons')) {
    violations.push(
      `${formatPath(file)} imports the legacy SVG sprite virtual module`
    )
  }
}

for (const file of appRuntimeFiles) {
  const source = readFileSync(file, 'utf8')
  if (source.includes('@/baseCom/SvgIcon') || /<SvgIcon\b/.test(source)) {
    violations.push(
      `${formatPath(file)} uses legacy SvgIcon; UI icons must come from @sun-world/icons/vue`
    )
  }
  const rootIconImportPattern =
    /import\s+\{([^}]+)\}\s+from\s+['"]@sun-world\/icons['"]/g
  for (const match of source.matchAll(rootIconImportPattern)) {
    const imports = match[1]
      .split(',')
      .map((value) =>
        value
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim()
      )
      .filter(Boolean)
    const forbidden = imports.filter(
      (importName) => !allowedRootIconImports.has(importName)
    )
    if (forbidden.length > 0) {
      violations.push(
        `${formatPath(file)} imports UI icons from the legacy @sun-world/icons root (${forbidden.join(', ')}); use @sun-world/icons/vue`
      )
    }
  }
  if (
    /assets\/svgs/.test(source) ||
    source.split(/\r?\n/).some((line) => /^import\b.*\.svg['"]/.test(line))
  ) {
    violations.push(
      `${formatPath(file)} imports raw SVG assets; UI icons must come from @sun-world/icons/vue unless they are logo, brand, loading, or editor shape assets`
    )
  }
}

const iconsPackage = readJson(iconsPackagePath)
for (const exportKey of ['./core', './vue']) {
  if (!iconsPackage.exports?.[exportKey]) {
    violations.push(`packages/icons/package.json must export "${exportKey}"`)
  }
}

if (!existsSync(noticePath)) {
  violations.push(
    'packages/icons/NOTICE.md must document the Lucide source and license'
  )
}

const viteConfigSource = readFileSync(viteConfigPath, 'utf8')
if (
  viteConfigSource.includes('vite-plugin-svg-icons') ||
  viteConfigSource.includes('createSvgIconsPlugin') ||
  viteConfigSource.includes('virtual:svg-icons')
) {
  violations.push(
    'apps/web/vite.config.ts must not use the legacy SVG sprite plugin'
  )
}

const uiDataSource = readFileSync(uiDataPath, 'utf8')
if (!/viewBox:\s*'0 0 24 24'/.test(uiDataSource)) {
  violations.push(
    'packages/icons/src/data/ui.ts must use 24x24 UI icon viewBox values'
  )
}
if (/\bfill:\s*['"]#/.test(uiDataSource)) {
  violations.push('UI icon data must not hard-code fill colors')
}
if (/\bstroke:\s*['"]#/.test(uiDataSource)) {
  violations.push('UI icon data must not hard-code stroke colors')
}

if (violations.length) {
  console.error('Icon package boundary check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Icon package boundary check passed.')
