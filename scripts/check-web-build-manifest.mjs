#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const manifestPath = join(repoRoot, 'apps/web/dist/build-manifest.json')
const violations = []

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0
}

if (!existsSync(manifestPath)) {
  violations.push(
    'apps/web/dist/build-manifest.json is missing; run the web build manifest generator'
  )
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const assets = Array.isArray(manifest.assets) ? manifest.assets : []

  if (manifest.schemaVersion !== 1) {
    violations.push('build manifest schemaVersion must be 1')
  }
  if (manifest.app !== '@sun-world/blog') {
    violations.push('build manifest app must be @sun-world/blog')
  }
  if (manifest.distDir !== 'apps/web/dist') {
    violations.push('build manifest distDir must be apps/web/dist')
  }
  if (!Number.isInteger(Date.parse(String(manifest.generatedAt)))) {
    violations.push('build manifest generatedAt must be an ISO timestamp')
  }
  if (!isPositiveInteger(manifest.totals?.assetCount)) {
    violations.push('build manifest totals.assetCount must be positive')
  }
  if (!isPositiveInteger(manifest.totals?.jsGzipBytes)) {
    violations.push('build manifest totals.jsGzipBytes must be positive')
  }
  if (!isPositiveInteger(manifest.totals?.cssGzipBytes)) {
    violations.push('build manifest totals.cssGzipBytes must be positive')
  }
  if (assets.length !== manifest.totals?.assetCount) {
    violations.push('build manifest totals.assetCount must match assets length')
  }

  const jsAssets = assets.filter((asset) => asset.extension === '.js')
  const cssAssets = assets.filter((asset) => asset.extension === '.css')
  const initialAssets = assets.filter((asset) => asset.isInitial === true)
  const lazyJsAssets = jsAssets.filter((asset) => asset.isInitial === false)

  if (jsAssets.length === 0) {
    violations.push('build manifest must include JavaScript assets')
  }
  if (cssAssets.length === 0) {
    violations.push('build manifest must include CSS assets')
  }
  if (initialAssets.length === 0) {
    violations.push('build manifest must mark assets referenced by index.html')
  }
  if (lazyJsAssets.length === 0) {
    violations.push('build manifest must expose lazy JavaScript chunks')
  }

  for (const asset of assets) {
    if (typeof asset.path !== 'string' || !asset.path.startsWith('assets/')) {
      violations.push('each build manifest asset path must start with assets/')
      break
    }
    if (!['.js', '.css'].includes(asset.extension)) {
      violations.push('each build manifest asset extension must be .js or .css')
      break
    }
    if (!isPositiveInteger(asset.rawBytes) || !isPositiveInteger(asset.gzipBytes)) {
      violations.push('each build manifest asset must include rawBytes and gzipBytes')
      break
    }
    if (typeof asset.isInitial !== 'boolean') {
      violations.push('each build manifest asset must include isInitial boolean')
      break
    }
  }
}

if (violations.length) {
  console.error('Frontend build manifest check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Frontend build manifest check passed.')
