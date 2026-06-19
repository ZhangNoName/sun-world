#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const checks = [
  {
    label: 'Root check script protocol',
    command: 'node',
    args: ['scripts/check-root-check-script.mjs'],
  },
  {
    label: 'Platform goal audit',
    command: 'pnpm',
    args: ['check:platform'],
  },
  {
    label: 'Git whitespace check',
    command: 'git',
    args: ['diff', '--check'],
  },
  {
    label: 'UI package test',
    command: 'pnpm',
    args: ['test:ui'],
  },
  {
    label: 'UI package build',
    command: 'pnpm',
    args: ['build:ui'],
  },
  {
    label: 'Frontend full check',
    command: 'pnpm',
    args: ['check:web'],
  },
  {
    label: 'Backend API check',
    command: 'pnpm',
    args: ['check:api'],
  },
  {
    label: 'Compose static check',
    command: 'pnpm',
    args: ['check:compose'],
  },
]

let passed = 0

function runCheck(check) {
  console.log(`\n====> ${check.label}`)
  const result = spawnSync(check.command, check.args, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  })

  if (result.error) {
    console.error(result.error.message)
    process.exit(1)
  }

  if ((result.status ?? 1) !== 0) {
    console.error(`FAIL: ${check.label}`)
    process.exit(result.status ?? 1)
  }

  passed += 1
  console.log(`PASS: ${check.label}`)
}

for (const check of checks) {
  runCheck(check)
}

console.log(`\nAll checks passed (${passed}/${checks.length}).`)
