import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { createBaseUiSourceAliases } from '../base-ui/source-aliases'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    ...(mode === 'lib'
      ? [
          dts({
            outDir: 'dist/types',
            insertTypesEntry: true,
            exclude: ['src/**/*.test.*', 'src/test/**'],
          }),
        ]
      : []),
  ],
  resolve: {
    alias: createBaseUiSourceAliases(path.resolve(__dirname, '../base-ui/src')),
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
      name: 'SunWorldAiComposer',
      formats: ['es'],
      fileName: (format) => `ai-composer.${format}.js`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', /^@sun-world\//],
    },
  },
}))
