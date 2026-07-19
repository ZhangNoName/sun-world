#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const uiSource = resolve(repoRoot, 'packages/ui/src')
const primitives = [
  'button',
  'card',
  'checkbox',
  'dialog',
  'dropdown-menu',
  'input',
  'label',
  'loading-skeleton',
  'select',
  'tabs',
  'tag',
  'textarea',
  'toast',
  'tooltip',
]
const patterns = [
  'chat-composer',
  'chat-shell',
  'date-picker',
  'list',
  'pagination',
  'theme-provider',
]
const failures = []
const webVite = resolve(repoRoot, 'apps/web/vite.config.ts')
const webVitest = resolve(repoRoot, 'apps/web/vitest.config.ts')

for (const [group, names] of [
  ['components', primitives],
  ['patterns', patterns],
]) {
  for (const name of names) {
    const directory = resolve(uiSource, group, name)
    for (const file of ['index.ts', `${name}.tsx`, `${name}.css`]) {
      if (!existsSync(resolve(directory, file)))
        failures.push(`Missing ${group}/${name}/${file}`)
    }
  }
}

const legacyComponents = resolve(uiSource, 'components')
if (existsSync(legacyComponents)) {
  for (const file of readdirSync(legacyComponents)) {
    if (/^Sun.*\.tsx$/.test(file)) failures.push(`Legacy component: ${file}`)
  }
}
for (const name of [...primitives, ...patterns]) {
  if (existsSync(resolve(uiSource, `${name}.ts`)))
    failures.push(`Legacy forwarding entry: src/${name}.ts`)
}
if (existsSync(resolve(uiSource, 'contracts'))) {
  failures.push('Legacy split contracts directory: src/contracts')
}
for (const config of [webVite, webVitest]) {
  const source = readFileSync(config, 'utf8')
  if (!source.includes('createUiSourceAliases')) {
    failures.push(`UI source aliases not migrated: ${config}`)
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('UI shadcn structure check passed.')
