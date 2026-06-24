#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const dockerfilePath = resolve(repoRoot, 'Dockerfile')
const nginxConfigPath = resolve(repoRoot, 'deploy/frontend/nginx.conf')

const violations = []

if (!existsSync(dockerfilePath)) {
  violations.push('Dockerfile must exist')
}

if (!existsSync(nginxConfigPath)) {
  violations.push('deploy/frontend/nginx.conf must exist')
}

const dockerfile = existsSync(dockerfilePath)
  ? readFileSync(dockerfilePath, 'utf8')
  : ''
const nginxConfig = existsSync(nginxConfigPath)
  ? readFileSync(nginxConfigPath, 'utf8')
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
    'try_files $uri $uri.html $uri/ /index.html',
  ]

  for (const fragment of requiredFragments) {
    if (!nginxConfig.includes(fragment)) {
      violations.push(`frontend nginx SPA fallback must contain: ${fragment}`)
    }
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
