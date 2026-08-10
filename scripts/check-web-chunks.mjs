#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const assetsDir = join(root, 'apps/web/dist/assets')
const failures = []
const routeOnlyChunk =
  /^(?:page-(?:game-tiles|tools|keep|login|register|me|qq-callback)|manage-shell|admin-charts|video-player|tile-export|md-editor-(?:preview|editor)|echarts|zrender|VideoPage|jszip\.min|ArticleEditorPage|AdminChartsPage|AigcPage|AdminMetricsPage|AdminLogsPage|BlogDetailPage|EditorCanvasPage|tools\.page|keep|login|register|me|qqCb)\./
if (!existsSync(assetsDir))
  failures.push('apps/web/dist/assets is missing; build first')
else {
  const assets = readdirSync(assetsDir)
  const jsAssets = assets.filter((asset) => asset.endsWith('.js'))
  const importGraph = new Map(
    jsAssets.map((asset) => {
      const source = readFileSync(join(assetsDir, asset), 'utf8')
      const imports = [
        ...source.matchAll(/(?:from\s*|import\s*)["']\.\/([^"']+)["']/g),
      ]
        .map((match) => match[1])
        .filter((dependency) => jsAssets.includes(dependency))
      return [asset, imports]
    })
  )
  const html = readFileSync(join(root, 'apps/web/dist/index.html'), 'utf8')
  const entry = html.match(
    /<script[^>]+type="module"[^>]+src="\/assets\/([^"]+\.js)"/
  )?.[1]
  const initialAssets = new Set()
  function visitInitial(asset) {
    if (!asset || initialAssets.has(asset)) return
    initialAssets.add(asset)
    for (const dependency of importGraph.get(asset) ?? [])
      visitInitial(dependency)
  }
  visitInitial(entry)
  const eagerRouteChunk = [...initialAssets].find((asset) =>
    routeOnlyChunk.test(asset)
  )
  if (eagerRouteChunk)
    failures.push(
      `initial bundle statically imports route-only chunk ${eagerRouteChunk}`
    )
  for (const names of [
    ['VideoPage', 'video-player'],
    ['jszip.min', 'tile-export'],
    ['ArticleEditorPage', 'md-editor-editor'],
    ['AdminChartsPage', 'admin-charts'],
    ['tools.page', 'page-tools'],
    ['keep', 'page-keep'],
    ['login', 'page-login'],
    ['register', 'page-register'],
    ['me', 'page-me'],
    ['qqCb', 'page-qq-callback'],
  ]) {
    if (
      !assets.some((asset) =>
        names.some((name) => new RegExp(`^${name}\\..*\\.js$`).test(asset))
      )
    )
      failures.push(`missing lazy chunk ${names[0]}`)
  }
  if (
    [...html.matchAll(/modulepreload[^>]+\/assets\/([^"']+)/g)].some((match) =>
      routeOnlyChunk.test(match[1])
    )
  )
    failures.push(
      'production HTML preloads a route-only or optional heavy chunk'
    )
}

const util = readFileSync(join(root, 'apps/web/src/util/function.ts'), 'utf8')
if (
  !util.includes("await import('jszip')") ||
  /^import\s+.*['"]jszip['"]/m.test(util)
)
  failures.push('JSZip must remain dynamically imported inside export actions')
const manage = readFileSync(
  join(root, 'apps/web/src/modules/admin/index.ts'),
  'utf8'
)
if (
  !/lazy\(\s*\(\)\s*=>\s*import\(['"]\.\/pages\/AdminChartsPage['"]\)\s*\)/.test(
    manage
  )
)
  failures.push('AdminChartsPage must be lazy-loaded by the admin module')
const chart = readFileSync(
  join(root, 'apps/web/src/modules/admin/ui/ChartsCard.tsx'),
  'utf8'
)
if (
  !chart.includes("import('echarts/core')") ||
  !chart.includes('chart?.dispose()')
)
  failures.push(
    'ChartsCard must lazy-load ECharts core and dispose the instance'
  )
const main = readFileSync(join(root, 'apps/web/src/main.tsx'), 'utf8')
if (/element-plus|\.vue/.test(main))
  failures.push('React entry must not reference Vue or Element Plus')

if (failures.length) {
  console.error('Frontend chunk boundary check failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}
console.log('Frontend chunk boundary check passed.')
