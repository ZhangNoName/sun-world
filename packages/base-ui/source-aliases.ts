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
  'select',
  'separator',
  'sheet',
  'skeleton',
  'sidebar',
  'table',
  'tabs',
  'textarea',
  'tooltip',
] as const

export function createBaseUiSourceAliases(sourceRoot: string) {
  return [
    ...primitives.map((name) => ({
      find: `@sun-world/base-ui/${name}`,
      replacement: resolve(sourceRoot, `components/${name}/index.ts`),
    })),
    {
      find: '@sun-world/base-ui',
      replacement: resolve(sourceRoot, 'index.ts'),
    },
  ]
}
