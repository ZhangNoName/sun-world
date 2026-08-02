#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(import.meta.dirname, '..')
const basePackageDir = resolve(repoRoot, 'packages/base-ui')
const uiPackagePath = resolve(repoRoot, 'packages/ui/package.json')
const uiSourceDir = resolve(repoRoot, 'packages/ui/src')
const webSourceDir = resolve(repoRoot, 'apps/web/src')

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

const sunWorldEntries = [
  'chat-composer',
  'chat-shell',
  'compound-controls',
  'date-picker',
  'form-controls',
  'list',
  'loading-skeleton',
  'pagination',
  'sw-input',
  'sw-select',
  'sw-button',
  'sw-dialog',
  'sw-dropdown-menu',
  'sw-sidebar',
  'tag',
  'theme-provider',
  'toast',
]

const failures = []
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

if (!existsSync(resolve(basePackageDir, 'package.json'))) {
  failures.push('Missing packages/base-ui/package.json')
} else {
  const basePackage = readJson(resolve(basePackageDir, 'package.json'))
  if (basePackage.name !== '@sun-world/base-ui') {
    failures.push(
      'packages/base-ui/package.json must be named @sun-world/base-ui'
    )
  }
  for (const name of basePrimitives) {
    if (!basePackage.exports?.[`./${name}`]) {
      failures.push(`@sun-world/base-ui must export ./${name}`)
    }
    if (
      !existsSync(resolve(basePackageDir, 'src/components', name, 'index.ts'))
    ) {
      failures.push(`Missing base-ui primitive source: ${name}`)
    }
  }
}

if (existsSync(uiPackagePath)) {
  const uiPackage = readJson(uiPackagePath)
  for (const name of sunWorldEntries) {
    if (!uiPackage.exports?.[`./${name}`]) {
      failures.push(`@sun-world/ui must export Sun World entry ./${name}`)
    }
  }
  for (const name of basePrimitives) {
    if (
      existsSync(resolve(uiSourceDir, 'components', name, 'index.ts')) ||
      existsSync(resolve(uiSourceDir, 'components', name, `${name}.tsx`))
    ) {
      failures.push(
        `packages/ui/src/components/${name} must not contain a base-ui primitive`
      )
    }
    if (uiPackage.exports?.[`./${name}`]) {
      failures.push(`@sun-world/ui must not export base primitive ./${name}`)
    }
  }
}

// Keep this check deliberately scoped to application source. Package-internal
// compatibility adapters are allowed to depend on base-ui while migrating.
const appFiles = []
function collect(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const path = resolve(dir, name)
    if (statSync(path).isDirectory()) collect(path)
    else if (/\.(?:ts|tsx)$/.test(name)) appFiles.push(path)
  }
}

collect(webSourceDir)
const primitiveImportPattern = new RegExp(
  `@sun-world/ui/(?:${basePrimitives.join('|')})(?:['"])`
)
for (const file of appFiles) {
  const source = readFileSync(file, 'utf8')
  if (primitiveImportPattern.test(source)) {
    failures.push(
      `${file.replace(`${repoRoot}${process.platform === 'win32' ? '\\' : '/'}`, '')} imports a base primitive from @sun-world/ui`
    )
  }
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}

console.log('Base UI package boundary check passed.')
