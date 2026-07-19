import { resolve } from 'node:path'

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
] as const

const patterns = [
  'chat-composer',
  'chat-shell',
  'date-picker',
  'list',
  'pagination',
  'theme-provider',
] as const

export function createUiSourceAliases(sourceRoot: string) {
  return [
    ...primitives.map((name) => ({
      find: `@sun-world/ui/${name}`,
      replacement: resolve(sourceRoot, `components/${name}/index.ts`),
    })),
    ...patterns.map((name) => ({
      find: `@sun-world/ui/${name}`,
      replacement: resolve(sourceRoot, `patterns/${name}/index.ts`),
    })),
    { find: '@sun-world/ui', replacement: sourceRoot },
  ]
}
