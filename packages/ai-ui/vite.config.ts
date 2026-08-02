import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { createBaseUiSourceAliases } from '../base-ui/source-aliases'
import { createUiSourceAliases } from '../ui/source-aliases'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'lib'
      ? [dts({ outDir: 'dist/types', insertTypesEntry: true })]
      : []),
  ],
  resolve: {
    alias: [
      {
        find: '@sun-world/ai-composer',
        replacement: path.resolve(__dirname, '../ai-composer/src'),
      },
      {
        find: '@sun-world/contracts',
        replacement: path.resolve(__dirname, '../contracts/src'),
      },
      {
        find: '@sun-world/icons',
        replacement: path.resolve(__dirname, '../icons/src'),
      },
      ...createBaseUiSourceAliases(path.resolve(__dirname, '../base-ui/src')),
      ...createUiSourceAliases(path.resolve(__dirname, '../ui/src')),
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 20_000,
  },
  build: {
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'SunWorldAiUi',
      fileName: (format) => `ai-ui.${format}.js`,
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        /^@sun-world\//,
        'echarts',
        'react-markdown',
        'remark-gfm',
        'rehype-sanitize',
      ],
    },
  },
}))
