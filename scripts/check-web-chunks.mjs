#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const assetsDir = join(root, 'apps/web/dist/assets')
const failures = []
if (!existsSync(assetsDir)) failures.push('apps/web/dist/assets is missing; build first')
else {
  const assets = readdirSync(assetsDir)
  for (const name of [
    'video-player', 'tile-export', 'md-editor-preview', 'md-editor-editor',
    'admin-charts', 'page-game-tiles', 'page-tools', 'page-keep',
    'page-login', 'page-register', 'page-me', 'page-qq-callback', 'manage-shell',
  ]) {
    if (!assets.some((asset) => new RegExp(`^${name}\\..*\\.js$`).test(asset)))
      failures.push(`missing lazy chunk ${name}`)
  }
  const html = readFileSync(join(root, 'apps/web/dist/index.html'), 'utf8')
  if (/modulepreload[^>]+(?:page-|manage-shell|admin-charts|video-player|tile-export|md-editor-|echarts|zrender)/.test(html))
    failures.push('production HTML preloads a route-only or optional heavy chunk')
}

const util = readFileSync(join(root, 'apps/web/src/util/function.ts'), 'utf8')
if (!util.includes("await import('jszip')") || /^import\s+.*['"]jszip['"]/m.test(util))
  failures.push('JSZip must remain dynamically imported inside export actions')
const manage = readFileSync(join(root, 'apps/web/src/pages/manage/index.tsx'), 'utf8')
if (!/lazy\(\s*\(\)\s*=>\s*import\(['"]@\/modules\/admin\/pages\/AdminChartsPage['"]\)\s*\)/.test(manage))
  failures.push('AdminChartsPage must be lazy-loaded by the management view')
const chart = readFileSync(join(root, 'apps/web/src/modules/admin/ui/ChartsCard.tsx'), 'utf8')
if (!chart.includes("import('echarts/core')") || !chart.includes('chart?.dispose()'))
  failures.push('ChartsCard must lazy-load ECharts core and dispose the instance')
const main = readFileSync(join(root, 'apps/web/src/main.tsx'), 'utf8')
if (/element-plus|\.vue/.test(main)) failures.push('React entry must not reference Vue or Element Plus')

if (failures.length) {
  console.error('Frontend chunk boundary check failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Frontend chunk boundary check passed.')
