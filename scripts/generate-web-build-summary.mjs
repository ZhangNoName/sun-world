#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = join(repoRoot, 'apps/web/dist/build-manifest.json')
const summaryPath = join(repoRoot, 'apps/web/dist/build-summary.json')
const budgetPath = join(repoRoot, 'apps/web/performance-budgets.json')

function normalizePath(path) {
  return path.split(sep).join('/')
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function toRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

function bytesFromKiB(value) {
  return Math.round(Number(value) * 1024)
}

function filterByExtensions(assets, extensions = ['.js', '.css']) {
  return assets.filter((asset) => extensions.includes(asset.extension))
}

function checkTotalBudget(budget, assets) {
  const matched = filterByExtensions(assets, budget.extensions)
  const actualGzipBytes = matched.reduce((sum, asset) => sum + asset.gzipBytes, 0)
  return {
    name: budget.name,
    type: budget.type,
    actualGzipBytes,
    limitGzipBytes: bytesFromKiB(budget.maxGzipKiB),
    ok: actualGzipBytes <= bytesFromKiB(budget.maxGzipKiB),
    detail: `${matched.length} assets`,
  }
}

function checkLargestBudget(budget, assets) {
  const matched = filterByExtensions(assets, budget.extensions)
  const largest = matched.reduce(
    (current, asset) => (asset.gzipBytes > current.gzipBytes ? asset : current),
    { gzipBytes: 0, path: 'none' }
  )
  return {
    name: budget.name,
    type: budget.type,
    actualGzipBytes: largest.gzipBytes,
    limitGzipBytes: bytesFromKiB(budget.maxGzipKiB),
    ok: largest.gzipBytes <= bytesFromKiB(budget.maxGzipKiB),
    detail: largest.path,
  }
}

function checkPatternBudget(budget, assets) {
  const matcher = toRegExp(budget.pattern)
  const matched = assets.filter((asset) => matcher.test(asset.path))
  const largest = matched.reduce(
    (current, asset) => (asset.gzipBytes > current.gzipBytes ? asset : current),
    { gzipBytes: 0, path: `missing ${budget.pattern}` }
  )
  return {
    name: budget.name,
    type: budget.type,
    actualGzipBytes: largest.gzipBytes,
    limitGzipBytes: bytesFromKiB(budget.maxGzipKiB),
    ok: matched.length > 0 && largest.gzipBytes <= bytesFromKiB(budget.maxGzipKiB),
    detail: largest.path,
  }
}

function checkBudget(budget, assets) {
  if (budget.type === 'total') return checkTotalBudget(budget, assets)
  if (budget.type === 'largest') return checkLargestBudget(budget, assets)
  if (budget.type === 'pattern') return checkPatternBudget(budget, assets)
  return {
    name: budget.name,
    type: String(budget.type ?? 'unknown'),
    actualGzipBytes: 0,
    limitGzipBytes: bytesFromKiB(budget.maxGzipKiB ?? 0),
    ok: false,
    detail: `unknown budget type ${budget.type}`,
  }
}

function buildSummary() {
  if (!existsSync(manifestPath)) {
    console.error('apps/web/dist/build-manifest.json is missing; run manifest generation first')
    process.exit(1)
  }

  const manifest = readJson(manifestPath)
  const budgetConfig = readJson(budgetPath)
  const assets = Array.isArray(manifest.assets) ? manifest.assets : []
  const budgetResults = budgetConfig.budgets.map((budget) =>
    checkBudget(budget, assets)
  )

  return {
    schemaVersion: 1,
    app: manifest.app,
    generatedAt: new Date().toISOString(),
    sourceManifest: 'apps/web/dist/build-manifest.json',
    totals: {
      assetCount: manifest.totals.assetCount,
      jsGzipBytes: manifest.totals.jsGzipBytes,
      cssGzipBytes: manifest.totals.cssGzipBytes,
      initialGzipBytes: manifest.totals.initialGzipBytes,
      lazyJsGzipBytes: manifest.totals.lazyJsGzipBytes,
    },
    topAssets: [...assets]
      .sort((a, b) => b.gzipBytes - a.gzipBytes)
      .slice(0, 10)
      .map((asset) => ({
        path: asset.path,
        extension: asset.extension,
        gzipBytes: asset.gzipBytes,
        rawBytes: asset.rawBytes,
        isInitial: asset.isInitial,
      })),
    budgetResults,
  }
}

const summary = buildSummary()
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
console.log(`Wrote ${normalizePath(relative(repoRoot, summaryPath))}`)
