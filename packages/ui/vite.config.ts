import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const entries = [
  'badge',
  'button',
  'card',
  'chat-composer',
  'chat-shell',
  'compound-controls',
  'checkbox',
  'date-picker',
  'form-controls',
  'dialog',
  'dropdown-menu',
  'field',
  'input',
  'label',
  'list',
  'loading-skeleton',
  'pagination',
  'select',
  'separator',
  'skeleton',
  'sonner',
  'tabs',
  'tag',
  'textarea',
  'theme-provider',
  'toast',
  'tooltip',
] as const

const primitiveEntries = new Set([
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
