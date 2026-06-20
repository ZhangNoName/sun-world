#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const webSourceRoot = join(repoRoot, 'apps', 'web', 'src')

const forbiddenPatterns = [
  {
    label: 'LangSmith personal access token',
    pattern: /lsv2_[A-Za-z0-9_]+/,
  },
  {
    label: 'OpenAI-style API key',
    pattern: /sk-[A-Za-z0-9_-]{20,}/,
  },
  {
    label: 'client-side LangChain API key variable',
    pattern: /\bVITE_LANGCHAIN_API_KEY\b|\bLANGCHAIN_API_KEY\b/,
  },
]

const checkedExtensions = new Set(['.ts', '.tsx', '.vue', '.js', '.jsx'])
const violations = []

function extensionOf(path) {
  const match = path.match(/\.[^.]+$/)
  return match ? match[0] : ''
}

function visit(path) {
  const status = statSync(path)
  if (status.isDirectory()) {
    for (const entry of readdirSync(path)) {
      visit(join(path, entry))
    }
    return
  }

  if (!checkedExtensions.has(extensionOf(path))) return

  const source = readFileSync(path, 'utf8')
  for (const { label, pattern } of forbiddenPatterns) {
    if (pattern.test(source)) {
      violations.push(`${relative(repoRoot, path)} contains ${label}`)
    }
  }
}

if (existsSync(webSourceRoot)) {
  visit(webSourceRoot)
}

if (violations.length) {
  console.error('Frontend client secret check failed:')
  for (const violation of violations) {
    console.error(`- ${violation}`)
  }
  process.exit(1)
}

console.log('Frontend client secret check passed.')
