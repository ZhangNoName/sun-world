#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const dockerfilePath = resolve(repoRoot, 'Dockerfile')
const nginxConfigPath = resolve(repoRoot, 'deploy/frontend/nginx.conf')
const prerenderScriptPath = resolve(
  repoRoot,
  'scripts/prerender-public-pages.mjs'
)
const webIndexPath = resolve(repoRoot, 'apps/web/index.html')

const violations = []

if (!existsSync(dockerfilePath)) {
  violations.push('Dockerfile must exist')
}

if (!existsSync(nginxConfigPath)) {
  violations.push('deploy/frontend/nginx.conf must exist')
}

if (!existsSync(prerenderScriptPath)) {
  violations.push('scripts/prerender-public-pages.mjs must exist')
}

if (!existsSync(webIndexPath)) {
  violations.push('apps/web/index.html must exist')
}

const dockerfile = existsSync(dockerfilePath)
  ? readFileSync(dockerfilePath, 'utf8')
  : ''
const nginxConfig = existsSync(nginxConfigPath)
  ? readFileSync(nginxConfigPath, 'utf8')
  : ''
const prerenderScript = existsSync(prerenderScriptPath)
  ? readFileSync(prerenderScriptPath, 'utf8')
  : ''
const webIndex = existsSync(webIndexPath)
  ? readFileSync(webIndexPath, 'utf8')
  : ''

if (!dockerfile.includes('deploy/frontend/nginx.conf')) {
  violations.push(
    'Dockerfile must copy deploy/frontend/nginx.conf into the nginx image'
  )
}

if (!dockerfile.includes('/etc/nginx/conf.d/default.conf')) {
  violations.push('Dockerfile must replace the default nginx server config')
}

if (nginxConfig) {
  const requiredFragments = [
    'listen 80',
    'root /usr/share/nginx/html',
    'index index.html',
    'try_files $uri $uri.html /spa.html',
  ]

  for (const fragment of requiredFragments) {
    if (!nginxConfig.includes(fragment)) {
      violations.push(`frontend nginx SPA fallback must contain: ${fragment}`)
    }
  }
}

if (prerenderScript) {
  const requiredFragments = [
    "const distSpaPath = join(distDir, 'spa.html')",
    'await writeSpaShell(indexHtml)',
    'await writeFile(distSpaPath, indexHtml)',
  ]

  for (const fragment of requiredFragments) {
    if (!prerenderScript.includes(fragment)) {
      violations.push(`frontend prerender must preserve SPA shell: ${fragment}`)
    }
  }
}

if (webIndex) {
  if (webIndex.includes('qweather-icons.css')) {
    violations.push(
      'apps/web/index.html must not block first paint on QWeather icon CSS'
    )
  }

  const telegramScript = webIndex.match(
    /<script\b[^>]*src=["']https:\/\/telegram\.org\/js\/telegram-web-app\.js["'][^>]*>/
  )?.[0]

  if (!telegramScript?.includes('defer')) {
    violations.push(
      'Telegram Web App script must be deferred in apps/web/index.html'
    )
  }

  const themeBootstrapIndex = webIndex.indexOf('data-theme-bootstrap')
  if (
    themeBootstrapIndex === -1 ||
    themeBootstrapIndex > webIndex.indexOf('</head>') ||
    !webIndex.includes("localStorage.getItem('sun-world-theme')") ||
    !webIndex.includes('root.dataset.colorMode = resolved')
  ) {
    violations.push(
      'apps/web/index.html must apply the persisted color mode before first paint'
    )
  }
}

if (violations.length) {
  console.error('Frontend SPA fallback check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Frontend SPA fallback check passed.')
