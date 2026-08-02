import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { createBaseUiSourceAliases } from '../base-ui/source-aliases'

const entries = [
  'chat-composer',
  'chat-shell',
  'compound-controls',
  'date-picker',
  'form-controls',
  'sw-button',
  'sw-dialog',
  'sw-dropdown-menu',
  'sw-sidebar',
  'sw-input',
  'list',
  'loading-skeleton',
  'pagination',
  'sw-select',
  'sonner',
  'tag',
  'theme-provider',
  'toast',
] as const

const entryPath = (entry: (typeof entries)[number]) =>
  path.resolve(
    __dirname,
    `src/${['sw-input', 'sw-select', 'sw-button', 'sw-dialog', 'sw-dropdown-menu', 'sw-sidebar', 'loading-skeleton', 'sonner', 'tag', 'toast'].includes(entry) ? 'components' : 'patterns'}/${entry}/index.ts`
  )

export default defineConfig({
  plugins: [
    react(),
    dts({
      outDir: 'dist/types',
      insertTypesEntry: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.spec.*', 'src/test/**'],
    }),
  ],
  resolve: {
    alias: [
      ...createBaseUiSourceAliases(path.resolve(__dirname, '../base-ui/src')),
      { find: '@', replacement: path.resolve(__dirname, 'src') },
    ],
  },
  build: {
    cssCodeSplit: false,
    lib: {
      entry: {
        ui: path.resolve(__dirname, 'src/index.ts'),
        ...Object.fromEntries(
          entries.map((entry) => [entry, entryPath(entry)])
        ),
      },
      name: 'SunWorldUi',
      fileName: (format, entryName) => `${entryName}.${format}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
})
