#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const tokens = readFileSync(
  resolve(repoRoot, 'apps/web/src/styles/design-tokens.css'),
  'utf8'
)

const required = [
  "[data-design='sun-world'][data-color-mode='light']",
  "[data-design='sun-world'][data-color-mode='dark']",
  "[data-design='apple'][data-color-mode='light']",
  "[data-design='apple'][data-color-mode='dark']",
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

console.log('Design theme contract check passed.')
