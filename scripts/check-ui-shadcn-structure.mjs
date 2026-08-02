#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const baseSource = resolve(repoRoot, 'packages/base-ui/src')
const uiSource = resolve(repoRoot, 'packages/ui/src')
const uiStylesPath = resolve(repoRoot, 'packages/ui/src/styles/globals.css')
const failures = []
const basePrimitives = [
  'badge',
  'button',
  'card',
  'checkbox',
  'dialog',
  'dropdown-menu',
  'field',
  'input',
  'label',
  'select',
  'separator',
  'sheet',
  'skeleton',
  'sidebar',
  'table',
  'tabs',
  'textarea',
  'tooltip',
]
const uiComponents = [
  'loading-skeleton',
  'sonner',
  'sw-input',
  'sw-select',
  'sw-button',
  'sw-dialog',
  'sw-dropdown-menu',
  'sw-sidebar',
  'tag',
  'toast',
]
const uiPatterns = [
  'chat-composer',
  'chat-shell',
  'compound-controls',
  'date-picker',
  'form-controls',
  'list',
  'pagination',
  'theme-provider',
]

for (const name of basePrimitives) {
  for (const file of ['index.ts', `${name}.tsx`]) {
    if (!existsSync(resolve(baseSource, 'components', name, file))) {
      failures.push(`Missing base-ui/components/${name}/${file}`)
    }
  }
}
for (const name of uiComponents) {
  for (const file of ['index.ts', `${name}.tsx`]) {
    if (!existsSync(resolve(uiSource, 'components', name, file))) {
      failures.push(`Missing ui/components/${name}/${file}`)
    }
  }
}
for (const name of uiPatterns) {
  for (const file of ['index.ts', `${name}.tsx`]) {
    if (!existsSync(resolve(uiSource, 'patterns', name, file))) {
      failures.push(`Missing ui/patterns/${name}/${file}`)
    }
  }
}

for (const config of [
  resolve(repoRoot, 'apps/web/vite.config.ts'),
  resolve(repoRoot, 'apps/web/vitest.config.ts'),
]) {
  const source = readFileSync(config, 'utf8')
  if (!source.includes('createBaseUiSourceAliases')) {
    failures.push(`Base UI source aliases not registered: ${config}`)
  }
  if (!source.includes('createUiSourceAliases')) {
    failures.push(`UI source aliases not registered: ${config}`)
  }
}

const uiStyles = readFileSync(uiStylesPath, 'utf8')
if (!uiStyles.includes("@source '../../../base-ui/src/**/*.{ts,tsx}';")) {
  failures.push(
    'packages/ui/src/styles/globals.css must scan packages/base-ui/src so Base UI utility classes are generated'
  )
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('UI package structure check passed.')
