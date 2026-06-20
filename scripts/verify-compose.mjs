#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const composeFile = resolve(repoRoot, 'docker-compose.yml')

function run(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...options,
  })

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr]
      .filter(Boolean)
      .join('\n')
      .trim()
    throw new Error(output || `docker ${args.join(' ')} failed`)
  }

  return result.stdout.trim()
}

if (!existsSync(composeFile)) {
  throw new Error(`docker-compose.yml not found at ${composeFile}`)
}

function assertComposeShape(rendered) {
  const requiredSnippets = [
    'frontend:',
    'api:',
    'profiles:',
    '- api',
    'target: /home/lighthouse/.config/blog_end',
    'target: /app/src/conf',
    'read_only: true',
    '8081:80',
  ]

  for (const snippet of requiredSnippets) {
    if (!rendered.includes(snippet)) {
      throw new Error(`compose file is missing required snippet: ${snippet}`)
    }
  }

  const apiPortSnippets = [
    '127.0.0.1:${BLOG_API_HOST_PORT:-18000}:8000',
    '127.0.0.1:18000:8000',
  ]
  if (!apiPortSnippets.some((snippet) => rendered.includes(snippet))) {
    throw new Error(
      `compose file is missing required API staging port binding: ${apiPortSnippets.join(' or ')}`
    )
  }

  const secretSourceSnippets = [
    'source: ${BLOG_API_SECRET_DIR:-/home/lighthouse/.config/blog_end}',
    'source: /home/lighthouse/.config/blog_end',
  ]
  if (!secretSourceSnippets.some((snippet) => rendered.includes(snippet))) {
    throw new Error(
      `compose file is missing required API secret directory source: ${secretSourceSnippets.join(' or ')}`
    )
  }

  const configSourceSnippets = [
    'source: ${BLOG_API_CONFIG_DIR:-/home/lighthouse/blog/blog_end/src/conf}',
    'source: /home/lighthouse/blog/blog_end/src/conf',
  ]
  if (!configSourceSnippets.some((snippet) => rendered.includes(snippet))) {
    throw new Error(
      `compose file is missing required API config directory source: ${configSourceSnippets.join(' or ')}`
    )
  }
}

console.log('==> Validating Docker Compose syntax...')
try {
  run(['compose', '-f', composeFile, 'version'])
} catch (error) {
  const rawCompose = readFileSync(composeFile, 'utf8')
  assertComposeShape(rawCompose)
  console.log(
    '==> Docker CLI is not available; static compose validation passed.'
  )
  console.log(
    'No deployment command was run. Install Docker to enable docker compose config validation.'
  )
  process.exit(0)
}

run(['compose', '-f', composeFile, 'config', '--quiet'])

const services = run(['compose', '-f', composeFile, 'config', '--services'])
  .split(/\r?\n/)
  .filter(Boolean)
const profiles = run(['compose', '-f', composeFile, 'config', '--profiles'])
  .split(/\r?\n/)
  .filter(Boolean)
const rendered = run(['compose', '-f', composeFile, 'config'])

for (const service of ['frontend', 'api']) {
  if (!services.includes(service)) {
    throw new Error(`${service} service is missing`)
  }
}

if (!profiles.includes('api')) {
  throw new Error('api profile is missing')
}

assertComposeShape(rendered)

console.log('==> Compose config is valid.')
console.log(
  'No deployment command was run. This script does not call up, run, restart, rm, or systemctl.'
)
