import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const entries = [
  'button',
  'card',
  'chat-composer',
  'chat-shell',
  'checkbox',
  'date-picker',
  'dialog',
  'dropdown-menu',
  'input',
  'label',
  'list',
  'loading-skeleton',
  'pagination',
  'select',
  'tabs',
  'tag',
  'textarea',
  'theme-provider',
  'toast',
  'tooltip',
] as const

const primitiveEntries = new Set([
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
])

const entryPath = (entry: (typeof entries)[number]) =>
  path.resolve(
    __dirname,
    `src/${primitiveEntries.has(entry) ? 'components' : 'patterns'}/${entry}/index.ts`
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
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
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
