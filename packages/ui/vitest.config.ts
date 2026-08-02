import { defineConfig } from 'vitest/config'
import { createBaseUiSourceAliases } from '../base-ui/source-aliases'
import { createUiSourceAliases } from './source-aliases'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      ...createBaseUiSourceAliases(path.resolve(__dirname, '../base-ui/src')),
      ...createUiSourceAliases(path.resolve(__dirname, 'src')),
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    testTimeout: 20_000,
    include: ['src/**/*.react.spec.tsx'],
  },
})
