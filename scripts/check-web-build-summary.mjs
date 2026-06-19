#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const summaryPath = join(repoRoot, 'apps/web/dist/build-summary.json')
const violations = []

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

if (!existsSync(summaryPath)) {
  violations.push(
    'apps/web/dist/build-summary.json is missing; run the web build summary generator'
  )
} else {
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'))
  const topAssets = Array.isArray(summary.topAssets) ? summary.topAssets : []
  const budgetResults = Array.isArray(summary.budgetResults)
    ? summary.budgetResults
    : []

  if (summary.schemaVersion !== 1) {
    violations.push('build summary schemaVersion must be 1')
  }
  if (summary.app !== '@sun-world/blog') {
    violations.push('build summary app must be @sun-world/blog')
  }
  if (summary.sourceManifest !== 'apps/web/dist/build-manifest.json') {
    violations.push('build summary sourceManifest must point to build-manifest.json')
  }
  if (!Number.isInteger(Date.parse(String(summary.generatedAt)))) {
    violations.push('build summary generatedAt must be an ISO timestamp')
  }
  if (!isPositiveInteger(summary.totals?.assetCount)) {
    violations.push('build summary totals.assetCount must be positive')
  }
  if (!isPositiveInteger(summary.totals?.jsGzipBytes)) {
    violations.push('build summary totals.jsGzipBytes must be positive')
  }
  if (!isPositiveInteger(summary.totals?.cssGzipBytes)) {
    violations.push('build summary totals.cssGzipBytes must be positive')
  }
  if (!isNonNegativeInteger(summary.totals?.lazyJsGzipBytes)) {
    violations.push('build summary totals.lazyJsGzipBytes must be non-negative')
  }
  if (!isPositiveInteger(summary.totals?.initialGzipBytes)) {
    violations.push('build summary totals.initialGzipBytes must be positive')
  }
  if (topAssets.length === 0 || topAssets.length > 10) {
    violations.push('build summary must include one to ten top assets')
  }
  if (budgetResults.length === 0) {
    violations.push('build summary must include budget results')
  }

  for (const asset of topAssets) {
    if (typeof asset.path !== 'string' || !asset.path.startsWith('assets/')) {
      violations.push('each top asset path must start with assets/')
      break
    }
    if (!isPositiveInteger(asset.gzipBytes)) {
      violations.push('each top asset must include positive gzipBytes')
      break
    }
  }

  for (const result of budgetResults) {
    if (typeof result.name !== 'string' || !result.name) {
      violations.push('each budget result must include a name')
      break
    }
    if (!isNonNegativeInteger(result.actualGzipBytes)) {
      violations.push('each budget result must include actualGzipBytes')
      break
    }
    if (!isPositiveInteger(result.limitGzipBytes)) {
      violations.push('each budget result must include limitGzipBytes')
      break
    }
    if (typeof result.ok !== 'boolean') {
      violations.push('each budget result must include ok boolean')
      break
    }
  }
}

if (violations.length) {
  console.error('Frontend build summary check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Frontend build summary check passed.')
