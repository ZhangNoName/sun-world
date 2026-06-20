#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')

function run(label, command, args, options = {}) {
  console.log(`==> ${label}...`)
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1)
  }

  console.log(`==> ${label} passed.`)
}

run('Frontend API contract route usage check', 'node', [
  'scripts/check-contract-route-usage.mjs',
])

run('Legacy API entrypoint check', 'node', [
  'scripts/check-legacy-api-entrypoints.mjs',
])

run('Frontend API base and dev proxy check', 'node', [
  'scripts/check-web-api-config.mjs',
])

run('Frontend client secret check', 'node', [
  'scripts/check-web-client-secrets.mjs',
])

run('AI interface check', 'node', ['scripts/check-ai-interface.mjs'])

run('Contracts tests', 'pnpm', ['test:contracts'])

run('Contracts generate script check', 'pnpm', ['check:contracts:generate'])

run('Frontend type check', 'pnpm', [
  '-C',
  'apps/web',
  'exec',
  'vue-tsc',
  '--noEmit',
])

run('Frontend build check', 'pnpm', ['-C', 'apps/web', 'build'], {
  env: {
    NODE_OPTIONS: '--max-old-space-size=4096',
  },
})

run('Frontend build manifest generation', 'node', [
  'scripts/generate-web-build-manifest.mjs',
])

run('Frontend build manifest check', 'node', [
  'scripts/check-web-build-manifest.mjs',
])

run('Frontend build summary generation', 'node', [
  'scripts/generate-web-build-summary.mjs',
])

run('Frontend build summary check', 'node', [
  'scripts/check-web-build-summary.mjs',
])

run('UI package boundary check', 'node', [
  'scripts/check-ui-package-boundary.mjs',
])

run('Frontend performance budget check', 'node', [
  'scripts/check-web-budgets.mjs',
])

run('Frontend chunk boundary check', 'node', ['scripts/check-web-chunks.mjs'])
