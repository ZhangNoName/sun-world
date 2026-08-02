import { resolve } from 'node:path'

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

const protocols = ['sw-input', 'sw-select'] as const
const components = [
  'loading-skeleton',
  'sonner',
  'sw-button',
  'sw-dialog',
  'sw-dropdown-menu',
  'sw-sidebar',
  'tag',
  'toast',
] as const

export function createUiSourceAliases(sourceRoot: string) {
  return [
    {
      find: '@sun-world/ui/styles.css',
      replacement: resolve(sourceRoot, 'styles/globals.css'),
    },
    ...components.map((name) => ({
      find: `@sun-world/ui/${name}`,
      replacement: resolve(sourceRoot, `components/${name}/index.ts`),
    })),
    ...patterns.map((name) => ({
      find: `@sun-world/ui/${name}`,
      replacement: resolve(sourceRoot, `patterns/${name}/index.ts`),
    })),
    ...protocols.map((name) => ({
      find: `@sun-world/ui/${name}`,
      replacement: resolve(sourceRoot, `components/${name}/index.ts`),
    })),
    { find: '@sun-world/ui', replacement: sourceRoot },
  ]
}
