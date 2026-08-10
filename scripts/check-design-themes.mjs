#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const tokens = readFileSync(
  resolve(repoRoot, 'apps/web/src/styles/design-tokens.css'),
  'utf8'
)

const required = [
  ':root {',
  "[data-color-mode='dark']",
  '--material-chrome:',
  '--surface-elevated:',
  '--font-ui:',
  '@media (prefers-reduced-motion: reduce)',
  '@media (prefers-reduced-transparency: reduce)',
  '@media (prefers-contrast: more)',
]

const missing = required.filter((entry) => !tokens.includes(entry))
if (missing.length) {
  console.error(`Design theme contract missing: ${missing.join(', ')}`)
  process.exit(1)
}

if (tokens.includes('[data-design=')) {
  console.error('Design theme contract must not restore a design-family layer.')
  process.exit(1)
}

console.log('Design theme contract check passed.')
