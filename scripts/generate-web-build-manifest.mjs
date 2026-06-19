#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { gzipSync } from 'node:zlib'
import { extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const distDir = join(repoRoot, 'apps/web/dist')
const assetsDir = join(distDir, 'assets')
const indexPath = join(distDir, 'index.html')
const manifestPath = join(distDir, 'build-manifest.json')

function normalizePath(path) {
  return path.split(sep).join('/')
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

function collectInitialAssetPaths() {
  if (!existsSync(indexPath)) return new Set()
  const indexHtml = readFileSync(indexPath, 'utf8')
  const matches = indexHtml.matchAll(/(?:href|src)=["']\/?(assets\/[^"']+\.(?:js|css))["']/g)
  return new Set([...matches].map((match) => match[1]))
}

function collectAssets() {
  const initialAssetPaths = collectInitialAssetPaths()
  return walkFiles(assetsDir)
    .filter((path) => ['.js', '.css'].includes(extname(path)))
    .map((path) => {
      const buffer = readFileSync(path)
      const relativePath = `assets/${normalizePath(relative(assetsDir, path))}`
      return {
        path: relativePath,
        extension: extname(path),
        rawBytes: buffer.byteLength,
        gzipBytes: gzipSync(buffer, { level: 9 }).byteLength,
        isInitial: initialAssetPaths.has(relativePath),
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

function sumBytes(assets, extension, key) {
  return assets
    .filter((asset) => asset.extension === extension)
    .reduce((sum, asset) => sum + asset[key], 0)
}

function buildManifest() {
  if (!existsSync(assetsDir)) {
    console.error('apps/web/dist/assets is missing; run the frontend build first')
    process.exit(1)
  }

  const assets = collectAssets()
  return {
    schemaVersion: 1,
    app: '@sun-world/blog',
    distDir: 'apps/web/dist',
    generatedAt: new Date().toISOString(),
    totals: {
      assetCount: assets.length,
      jsRawBytes: sumBytes(assets, '.js', 'rawBytes'),
      jsGzipBytes: sumBytes(assets, '.js', 'gzipBytes'),
      cssRawBytes: sumBytes(assets, '.css', 'rawBytes'),
      cssGzipBytes: sumBytes(assets, '.css', 'gzipBytes'),
      initialGzipBytes: assets
        .filter((asset) => asset.isInitial)
        .reduce((sum, asset) => sum + asset.gzipBytes, 0),
      lazyJsGzipBytes: assets
        .filter((asset) => asset.extension === '.js' && !asset.isInitial)
        .reduce((sum, asset) => sum + asset.gzipBytes, 0),
    },
    assets,
  }
}

const manifest = buildManifest()
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`Wrote ${normalizePath(relative(repoRoot, manifestPath))}`)
