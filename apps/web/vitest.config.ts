import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { createBaseUiSourceAliases } from '../../packages/base-ui/source-aliases'
import { createUiSourceAliases } from '../../packages/ui/source-aliases'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      ...createBaseUiSourceAliases(
        resolve(__dirname, '../../packages/base-ui/src')
      ),
      ...createUiSourceAliases(resolve(__dirname, '../../packages/ui/src')),
      { find: '@', replacement: resolve(__dirname, 'src') },
      {
        find: '@sun-world/contracts',
        replacement: resolve(__dirname, '../../packages/contracts/src'),
      },
      {
        find: '@sun-world/ai-ui',
        replacement: resolve(__dirname, '../../packages/ai-ui/src'),
      },
      {
        find: '@sun-world/ai-composer',
        replacement: resolve(__dirname, '../../packages/ai-composer/src'),
      },
      {
        find: '@sun-world/editor',
        replacement: resolve(__dirname, '../../packages/editor/src'),
      },
      {
        find: '@sun-world/icons',
        replacement: resolve(__dirname, '../../packages/icons/src'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
})
