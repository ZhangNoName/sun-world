import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

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
      {
        find: '@sun-world/ui/button',
        replacement: path.resolve(__dirname, '../ui/src/components/button'),
      },
      {
        find: '@sun-world/ui/input',
        replacement: path.resolve(__dirname, '../ui/src/components/input'),
      },
      {
        find: '@sun-world/ui/dialog',
        replacement: path.resolve(__dirname, '../ui/src/components/dialog'),
      },
      {
        find: '@sun-world/ui/chat-shell',
        replacement: path.resolve(__dirname, '../ui/src/patterns/chat-shell'),
      },
      {
        find: '@sun-world/ui/chat-composer',
        replacement: path.resolve(
          __dirname,
          '../ui/src/patterns/chat-composer'
        ),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
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
