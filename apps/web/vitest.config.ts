import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@sun-world/contracts': resolve(
        __dirname,
        '../../packages/contracts/src'
      ),
      '@sun-world/editor': resolve(__dirname, '../../packages/editor/src'),
      '@sun-world/icons': resolve(__dirname, '../../packages/icons/src'),
      '@sun-world/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
})
