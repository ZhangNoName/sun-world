#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = resolve(import.meta.dirname, '..')
const dockerfilePath = resolve(repoRoot, 'Dockerfile')
const runtimeDockerfilePath = resolve(
  repoRoot,
  'deploy/frontend/Dockerfile.runtime'
)
const NODE_VERSION = '24.17.0'
const PNPM_VERSION = '10.15.1'

if (!existsSync(dockerfilePath)) {
  throw new Error(`Dockerfile not found at ${dockerfilePath}`)
}

if (!existsSync(runtimeDockerfilePath)) {
  throw new Error(`Runtime Dockerfile not found at ${runtimeDockerfilePath}`)
}

const dockerfile = readFileSync(dockerfilePath, 'utf8').replace(/\r\n/g, '\n')

if (!dockerfile.includes(`FROM node:${NODE_VERSION} AS build`)) {
  throw new Error(
    `Dockerfile must build the frontend with Node ${NODE_VERSION}`
  )
}

if (!dockerfile.includes(`RUN npm install -g pnpm@${PNPM_VERSION}`)) {
  throw new Error(
    `Dockerfile must install pnpm ${PNPM_VERSION} in the frontend build image`
  )
}

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

const runtimeDockerfile = readFileSync(runtimeDockerfilePath, 'utf8').replace(
  /\r\n/g,
  '\n'
)
const runtimeInstructions = runtimeDockerfile
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))

if (
  runtimeInstructions.filter((line) => /^FROM\s+/i.test(line)).length !== 1 ||
  runtimeInstructions[0] !== 'ARG RUNTIME_BASE_IMAGE=nginx:alpine' ||
  runtimeInstructions[1] !== 'FROM ${RUNTIME_BASE_IMAGE}'
) {
  throw new Error(
    'deploy/frontend/Dockerfile.runtime must have exactly one parameterized local Nginx runtime stage'
  )
}

for (const requiredInstruction of [
  'RUN find /usr/share/nginx/html -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +',
  'COPY dist/ /usr/share/nginx/html/',
  'COPY nginx.conf /etc/nginx/conf.d/default.conf',
  'EXPOSE 80',
  'CMD ["nginx", "-g", "daemon off;"]',
]) {
  if (!runtimeInstructions.includes(requiredInstruction)) {
    throw new Error(
      `deploy/frontend/Dockerfile.runtime must contain: ${requiredInstruction}`
    )
  }
}

const allowedRuntimeInstruction = /^(?:ARG|FROM|RUN|COPY|EXPOSE|CMD)\s+/i
const unsupportedRuntimeInstructions = runtimeInstructions.filter(
  (line) => !allowedRuntimeInstruction.test(line)
)
if (unsupportedRuntimeInstructions.length) {
  throw new Error(
    `deploy/frontend/Dockerfile.runtime contains unsupported instructions:\n- ${unsupportedRuntimeInstructions.join('\n- ')}`
  )
}

if (
  runtimeInstructions.filter((line) => /^RUN\s+/i.test(line)).length !== 1 ||
  /(?:^|\n)\s*ADD\b/i.test(runtimeDockerfile) ||
  /\b(?:node(?:js)?|npm|pnpm|vite)\b/i.test(runtimeDockerfile)
) {
  throw new Error(
    'deploy/frontend/Dockerfile.runtime must contain only the fixed static-file cleanup RUN and no ADD, Node, npm, pnpm, or Vite build logic'
  )
}

console.log('Docker source and runtime build context checks passed.')

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
