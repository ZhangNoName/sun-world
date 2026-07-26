import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const webRoot = resolve(import.meta.dirname, '../..')
const read = (path: string) => readFileSync(resolve(webRoot, path), 'utf8')

describe('React source inspector', () => {
  it('uses the compile-time inspector with Alt activation only in development', () => {
    const main = read('src/main.tsx')
    const vite = read('vite.config.ts')
    const pkg = JSON.parse(read('package.json'))

    expect(pkg.devDependencies).toHaveProperty('react-dev-inspector')
    expect(pkg.devDependencies).toHaveProperty(
      '@react-dev-inspector/babel-plugin'
    )
    expect(pkg.devDependencies).toHaveProperty(
      '@react-dev-inspector/vite-plugin'
    )
    expect(pkg.dependencies).not.toHaveProperty('click-to-react-component')
    expect(main).toContain('<ReactSourceInspector />')
    expect(main).toContain('import.meta.env.DEV')
    expect(vite).toContain('@react-dev-inspector/vite-plugin')
    expect(vite).toContain('idempotentInspectorBabelPlugin')
    expect(vite).not.toContain("plugins: ['@react-dev-inspector/babel-plugin']")
  })
})
