#!/usr/bin/env node
import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const configPath = join(repoRoot, 'apps/web/performance-budgets.json')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function walkFiles(dir) {
  const result = []

  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stats = statSync(path)

    if (stats.isDirectory()) {
      result.push(...walkFiles(path))
    } else if (stats.isFile()) {
      result.push(path)
    }
  }

  return result
}

function normalizePath(path) {
  return path.split(sep).join('/')
}

function toRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')

  return new RegExp(`^${escaped}$`)
}

function toKiB(bytes) {
  return bytes / 1024
}

function formatKiB(value) {
  return `${value.toFixed(1)} KiB`
}

function collectAssets(distDir) {
  return walkFiles(distDir)
    .filter((path) => ['.js', '.css'].includes(extname(path)))
    .map((path) => {
      const buffer = readFileSync(path)
      return {
        path,
        relativePath: normalizePath(relative(distDir, path)),
        extension: extname(path),
        rawBytes: buffer.byteLength,
        gzipBytes: gzipSync(buffer, { level: 9 }).byteLength,
      }
    })
}

function filterByExtensions(assets, extensions = ['.js', '.css']) {
  return assets.filter((asset) => extensions.includes(asset.extension))
}

function checkTotalBudget(budget, assets) {
  const matched = filterByExtensions(assets, budget.extensions)
  const gzipKiB = toKiB(matched.reduce((sum, asset) => sum + asset.gzipBytes, 0))

  return {
    name: budget.name,
    actual: gzipKiB,
    limit: budget.maxGzipKiB,
    ok: gzipKiB <= budget.maxGzipKiB,
    detail: `${matched.length} assets`,
  }
}

function checkLargestBudget(budget, assets) {
  const matched = filterByExtensions(assets, budget.extensions)
  const largest = matched.reduce(
    (current, asset) => (asset.gzipBytes > current.gzipBytes ? asset : current),
    { gzipBytes: 0, relativePath: 'none' }
  )
  const gzipKiB = toKiB(largest.gzipBytes)

  return {
    name: budget.name,
    actual: gzipKiB,
    limit: budget.maxGzipKiB,
    ok: gzipKiB <= budget.maxGzipKiB,
    detail: largest.relativePath,
  }
}

function checkPatternBudget(budget, assets) {
  const matcher = toRegExp(budget.pattern)
  const matched = assets.filter((asset) => matcher.test(asset.relativePath))

  if (matched.length === 0) {
    return {
      name: budget.name,
      actual: 0,
      limit: budget.maxGzipKiB,
      ok: false,
      detail: `missing ${budget.pattern}`,
    }
  }

  const largest = matched.reduce((current, asset) =>
    asset.gzipBytes > current.gzipBytes ? asset : current
  )
  const gzipKiB = toKiB(largest.gzipBytes)

  return {
    name: budget.name,
    actual: gzipKiB,
    limit: budget.maxGzipKiB,
    ok: gzipKiB <= budget.maxGzipKiB,
    detail: largest.relativePath,
  }
}

function checkBudget(budget, assets) {
  if (budget.type === 'total') return checkTotalBudget(budget, assets)
  if (budget.type === 'largest') return checkLargestBudget(budget, assets)
  if (budget.type === 'pattern') return checkPatternBudget(budget, assets)

  return {
    name: budget.name,
    actual: 0,
    limit: budget.maxGzipKiB ?? 0,
    ok: false,
    detail: `unknown budget type ${budget.type}`,
  }
}

function printAssetSummary(assets) {
  const rows = [...assets]
    .sort((a, b) => b.gzipBytes - a.gzipBytes)
    .slice(0, 10)

  console.log('==> Largest frontend assets (gzip)')
  for (const asset of rows) {
    console.log(
      `    ${formatKiB(toKiB(asset.gzipBytes)).padStart(10)}  ${asset.relativePath}`
    )
  }
}

function main() {
  const config = readJson(configPath)
  const distDir = join(repoRoot, config.distDir)

  if (!existsSync(distDir)) {
    console.error(`Frontend dist directory not found: ${config.distDir}`)
    process.exit(1)
  }

  const assets = collectAssets(distDir)
  const results = config.budgets.map((budget) => checkBudget(budget, assets))
  const failures = results.filter((result) => !result.ok)

  printAssetSummary(assets)
  console.log('==> Frontend performance budgets')
  for (const result of results) {
    const state = result.ok ? 'PASS' : 'FAIL'
    console.log(
      `    ${state} ${result.name}: ${formatKiB(result.actual)} / ${formatKiB(
        result.limit
      )} (${result.detail})`
    )
  }

  if (failures.length > 0) {
    console.error('Frontend performance budget check failed.')
    process.exit(1)
  }

  console.log('==> Frontend performance budgets passed.')
}

main()
