#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const distAssetsDir = join(repoRoot, 'apps/web/dist/assets')
const distIndexPath = join(repoRoot, 'apps/web/dist/index.html')
const utilFunctionPath = join(repoRoot, 'apps/web/src/util/function.ts')
const catalogCardPath = join(repoRoot, 'apps/web/src/modules/blog/ui/CatalogCard.vue')
const blogModulePath = join(repoRoot, 'apps/web/src/modules/blog/index.ts')
const managePagePath = join(repoRoot, 'apps/web/src/pages/manage/index.vue')
const adminModulePath = join(repoRoot, 'apps/web/src/modules/admin/index.ts')
const adminChartConfigPath = join(repoRoot, 'apps/web/src/modules/admin/ui/chartConfig.ts')
const accountModulePath = join(repoRoot, 'apps/web/src/modules/account/index.ts')
const viteConfigPath = join(repoRoot, 'apps/web/vite.config.ts')
const appMainPath = join(repoRoot, 'apps/web/src/main.ts')
const uiComponentsDir = join(repoRoot, 'packages/ui/src/components')

const violations = []

if (!existsSync(distAssetsDir)) {
  violations.push('apps/web/dist/assets is missing; run the frontend build first')
} else {
  const assetNames = readdirSync(distAssetsDir)
  const requiredChunkPatterns = [
    {
      name: 'video-player',
      pattern: /^video-player\..*\.js$/,
      reason: 'video route playback dependencies should not be folded into global vendor',
    },
    {
      name: 'tile-export',
      pattern: /^tile-export\..*\.js$/,
      reason: 'JSZip export code should stay out of the initial route/vendor payload',
    },
    {
      name: 'vditor-preview',
      pattern: /^vditor-preview\..*\.js$/,
      reason: 'article reading should not share the full editor chunk',
    },
    {
      name: 'vditor-editor',
      pattern: /^vditor-editor\..*\.js$/,
      reason: 'article editing should keep the full editor isolated',
    },
    {
      name: 'admin-charts',
      pattern: /^admin-charts\..*\.js$/,
      reason: 'admin chart views should stay out of the manage shell until selected',
    },
    {
      name: 'page-game-tiles',
      pattern: /^page-game-tiles\..*\.js$/,
      reason: 'game tiles should remain a route-owned page chunk',
    },
    {
      name: 'page-tools',
      pattern: /^page-tools\..*\.js$/,
      reason: 'tools should remain a route-owned page chunk',
    },
    {
      name: 'page-keep',
      pattern: /^page-keep\..*\.js$/,
      reason: 'keep page should remain a route-owned page chunk',
    },
    {
      name: 'page-login',
      pattern: /^page-login\..*\.js$/,
      reason: 'login page should not share a broad legacy pages chunk',
    },
    {
      name: 'page-register',
      pattern: /^page-register\..*\.js$/,
      reason: 'register page should not share a broad legacy pages chunk',
    },
    {
      name: 'page-me',
      pattern: /^page-me\..*\.js$/,
      reason: 'profile page should not share a broad legacy pages chunk',
    },
    {
      name: 'page-qq-callback',
      pattern: /^page-qq-callback\..*\.js$/,
      reason: 'QQ callback page should not share a broad legacy pages chunk',
    },
    {
      name: 'manage-shell',
      pattern: /^manage-shell\..*\.js$/,
      reason: 'manage legacy shell should be named instead of folded into index',
    },
  ]

  for (const chunk of requiredChunkPatterns) {
    if (!assetNames.some((name) => chunk.pattern.test(name))) {
      violations.push(`missing ${chunk.name} chunk: ${chunk.reason}`)
    }
  }

  if (existsSync(distIndexPath)) {
    const distIndexSource = readFileSync(distIndexPath, 'utf8')
    const initialRouteChunkPatterns = [
      /assets\/page-(?:game-tiles|tools|keep|login|register|me|qq-callback)\./,
      /assets\/manage-shell\./,
      /assets\/admin-charts\./,
      /assets\/video-player\./,
      /assets\/tile-export\./,
      /assets\/vditor-(?:preview|editor)\./,
      /assets\/echarts\./,
      /assets\/zrender\./,
    ]
    if (initialRouteChunkPatterns.some((pattern) => pattern.test(distIndexSource))) {
      violations.push(
        'apps/web/dist/index.html must not preload route-only or optional heavy chunks'
      )
    }
  }
}

const utilSource = readFileSync(utilFunctionPath, 'utf8')
if (/^import\s+.*['"]jszip['"]/m.test(utilSource)) {
  violations.push(
    'apps/web/src/util/function.ts must load jszip dynamically inside export actions'
  )
}

const catalogCardSource = readFileSync(catalogCardPath, 'utf8')
if (/^import\s+(?!type\b).*['"]vditor['"]/m.test(catalogCardSource)) {
  violations.push(
    'CatalogCard.vue must not import the full Vditor runtime for catalog rendering'
  )
}

const blogModuleSource = readFileSync(blogModulePath, 'utf8')
if (/preload:\s*\(\)\s*=>\s*Promise\.all\(\[BlogDetailPage\(\),\s*ArticleEditorPage\(\)\]\)/.test(blogModuleSource)) {
  violations.push(
    'blog module preload must not warm the article editor while reading public articles'
  )
}

const managePageSource = readFileSync(managePagePath, 'utf8')
if (/^import\s+AdminChartsPage\s+from\s+['"]@\/modules\/admin\/pages\/AdminChartsPage\.vue['"]/m.test(managePageSource)) {
  violations.push(
    'manage page must load AdminChartsPage asynchronously when the charts tab is selected'
  )
}

const adminModuleSource = readFileSync(adminModulePath, 'utf8')
if (/preload:\s*/.test(adminModuleSource)) {
  violations.push(
    'admin module should rely on route-level lazy loading instead of broad module preload'
  )
}

const chartConfigSource = readFileSync(adminChartConfigPath, 'utf8')
if (/^import\s*\{[\s\S]*?\}\s*from\s+['"]echarts['"]/m.test(chartConfigSource)) {
  violations.push(
    'admin chartConfig.ts must use import type for ECharts option types'
  )
}

const accountModuleSource = readFileSync(accountModulePath, 'utf8')
if (/preload:\s*\(\)\s*=>\s*Promise\.all\(\[LoginPage\(\),\s*RegisterPage\(\),\s*MePage\(\),\s*QqCallbackPage\(\)\]\)/.test(accountModuleSource)) {
  violations.push(
    'account module should not preload all account routes together'
  )
}

const viteConfigSource = readFileSync(viteConfigPath, 'utf8')
if (/src\\?\/pages\\?\/\.\+\\?\.vue/.test(viteConfigSource) || /pages\s+涓嬬殑 vue/.test(viteConfigSource)) {
  violations.push(
    'vite manualChunks must not merge all legacy src/pages Vue files into index'
  )
}

const appMainSource = readFileSync(appMainPath, 'utf8')
if (/element-plus\/theme-chalk\/src\/index\.scss/.test(appMainSource)) {
  violations.push(
    'apps/web/src/main.ts must not import the full Element Plus stylesheet globally'
  )
}

const uiComponentNames = readdirSync(uiComponentsDir).filter((name) =>
  name.endsWith('.vue')
)
for (const componentName of uiComponentNames) {
  const componentPath = join(uiComponentsDir, componentName)
  const componentSource = readFileSync(componentPath, 'utf8')
  if (/^import\s+(?!type\b).*['"]element-plus['"]/m.test(componentSource)) {
    violations.push(
      `packages/ui component ${componentName} must not depend on Element Plus runtime components`
    )
  }
}

if (violations.length) {
  console.error('Frontend chunk boundary check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Frontend chunk boundary check passed.')
