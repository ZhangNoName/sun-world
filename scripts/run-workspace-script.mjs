#!/usr/bin/env node
import { spawnSync } from 'node:child_process'

const [filter, scriptName, nodeOptions = ''] = process.argv.slice(2)

if (!filter || !scriptName) {
  console.error(
    'Usage: node scripts/run-workspace-script.mjs <workspace-filter> <script> [node-options]'
  )
  process.exit(1)
}

const result = spawnSync('pnpm', ['-F', filter, 'run', scriptName], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    ...(nodeOptions ? { NODE_OPTIONS: nodeOptions } : {}),
  },
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
