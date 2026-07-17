import path from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  build: {
    minify: 'esbuild',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'SunWorldEditor',
      fileName: (format) => `editor.${format}.js`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: [],
      output: {},
    },
  },
  plugins: [
    dts({
      tsconfigPath: './tsconfig.app.json',
      entryRoot: path.resolve(__dirname, 'src'),
      outDir: 'dist',
      rollupTypes: true,
    }) as any,
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
