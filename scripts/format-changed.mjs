#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const mode = process.argv.includes('--write') ? '--write' : '--check'
const supportedExtensions = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.vue',
  '.json',
  '.yml',
  '.yaml',
  '.css',
  '.scss',
])

function run(command, args) {
  return spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
}

function gitLines(args) {
  const result = run('git', args)
  if ((result.status ?? 1) !== 0) {
    return []
  }
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

function normalizeDiffBase(base) {
  if (!base || /^0{40}$/.test(base)) {
    return ''
  }
  if (base.startsWith('refs/heads/')) {
    return `origin/${base.slice('refs/heads/'.length)}`
  }
  return base
}

function changedFilesFromCi() {
  const explicitBase = normalizeDiffBase(process.env.PRETTIER_BASE_REF ?? '')
  const ranges = []

  if (explicitBase) {
    ranges.push([explicitBase, 'HEAD'])
  }

  if (process.env.GITHUB_BASE_REF) {
    ranges.push([`origin/${process.env.GITHUB_BASE_REF}`, 'HEAD'])
  }

  ranges.push(['HEAD^', 'HEAD'])

  for (const [from, to] of ranges) {
    const files = gitLines([
      'diff',
      '--name-only',
      '--diff-filter=ACMR',
      from,
      to,
    ])
    if (files.length > 0) {
      return files
    }
  }

  return gitLines(['ls-tree', '-r', '--name-only', 'HEAD'])
}

function changedFilesFromLocal() {
  return [
    ...gitLines(['diff', '--name-only', '--diff-filter=ACMR']),
    ...gitLines(['diff', '--cached', '--name-only', '--diff-filter=ACMR']),
    ...gitLines(['ls-files', '--others', '--exclude-standard']),
  ]
}

function isSupported(filePath) {
  const dotIndex = filePath.lastIndexOf('.')
  if (dotIndex < 0) {
    return false
  }
  return supportedExtensions.has(filePath.slice(dotIndex))
}

const changedFiles = process.env.GITHUB_ACTIONS
  ? changedFilesFromCi()
  : changedFilesFromLocal()
const prettierTargets = [...new Set(changedFiles)].filter((filePath) => {
  return isSupported(filePath) && existsSync(resolve(repoRoot, filePath))
})

if (prettierTargets.length === 0) {
  console.log('No changed Prettier-supported files found.')
  process.exit(0)
}

console.log(
  `Running Prettier ${mode} on ${prettierTargets.length} changed file(s).`
)
const result = spawnSync(
  'pnpm',
  ['exec', 'prettier', mode, ...prettierTargets],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
