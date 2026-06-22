#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const dockerfilePath = resolve(repoRoot, 'Dockerfile')

if (!existsSync(dockerfilePath)) {
  throw new Error(`Dockerfile not found at ${dockerfilePath}`)
}

const dockerfile = readFileSync(dockerfilePath, 'utf8').replace(/\r\n/g, '\n')

function findWorkspaceManifests(rootDir) {
  const manifests = []
  const base = resolve(repoRoot, rootDir)
  if (!existsSync(base)) return manifests

  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifest = join(base, entry.name, 'package.json')
    if (existsSync(manifest)) {
      manifests.push(relative(repoRoot, manifest).replaceAll('\\', '/'))
    }
  }

  return manifests
}

const requiredFiles = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  ...findWorkspaceManifests('apps'),
  ...findWorkspaceManifests('packages'),
]

const missingCopies = requiredFiles.filter((file) => !dockerfile.includes(file))
if (missingCopies.length) {
  throw new Error(
    `Dockerfile dependency cache layer is missing manifest copy entries:\n- ${missingCopies.join('\n- ')}`
  )
}

const installIndex = dockerfile.indexOf('RUN pnpm install --frozen-lockfile')
const copySourceIndex = dockerfile.indexOf('COPY . .')

if (installIndex === -1) {
  throw new Error('Dockerfile must run pnpm install with --frozen-lockfile')
}

if (copySourceIndex === -1) {
  throw new Error('Dockerfile must copy source after installing dependencies')
}

if (installIndex > copySourceIndex) {
  throw new Error('Dockerfile must install dependencies before COPY . .')
}

console.log('Docker build context check passed.')

const spaFallbackCheck = spawnSync(
  process.execPath,
  [resolve(repoRoot, 'scripts/check-web-spa-fallback.mjs')],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  }
)

if (spaFallbackCheck.error) {
  console.error(spaFallbackCheck.error.message)
  process.exit(1)
}

process.exit(spaFallbackCheck.status ?? 1)
