import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

const entries = [
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
          entries.map((entry) => [
            entry,
            path.resolve(__dirname, `src/components/${entry}/index.ts`),
          ])
        ),
      },
      name: 'SunWorldBaseUi',
      fileName: (format, entryName) => `${entryName}.${format}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  },
})
