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
            path.resolve(__dirname, `src/${entry}.ts`),
          ])
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
