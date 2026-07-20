import { resolve } from 'node:path'

const primitives = [
  'badge',
  'button',
  'card',
  'checkbox',
  'dialog',
  'dropdown-menu',
  'field',
  'input',
  'label',
  'loading-skeleton',
  'select',
  'separator',
  'skeleton',
  'sonner',
  'tabs',
  'tag',
  'textarea',
  'toast',
  'tooltip',
] as const

const patterns = [
  'chat-composer',
  'chat-shell',
  'compound-controls',
  'date-picker',
  'form-controls',
  'list',
  'pagination',
  'theme-provider',
] as const

export function createUiSourceAliases(sourceRoot: string) {
  return [
    {
      find: '@sun-world/ui/styles.css',
      replacement: resolve(sourceRoot, 'styles/globals.css'),
    },
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
