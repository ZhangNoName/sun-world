import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import { createUiSourceAliases } from '../../packages/ui/source-aliases'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      ...createUiSourceAliases(resolve(__dirname, '../../packages/ui/src')),
      { find: '@', replacement: resolve(__dirname, 'src') },
      {
        find: '@sun-world/contracts',
        replacement: resolve(__dirname, '../../packages/contracts/src'),
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
