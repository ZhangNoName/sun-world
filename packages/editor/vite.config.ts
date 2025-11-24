import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import path from 'path'

export default defineConfig(({ command }) => {
  if (command === 'build') {
    // library build
    return {
      plugins: [
        vue(),
        dts({
          insertTypesEntry: true,
          outDir: 'dist',
        }),
      ],
      build: {
        lib: {
          entry: path.resolve(__dirname, 'src/index.ts'),
          name: 'SunWorldEditor',
          fileName: (format) => `editor.${format}.js`,
        },
        rollupOptions: {
          external: ['vue'],
          output: { globals: { vue: 'Vue' } },
        },
      },
      resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    }
  }

  // dev mode
  return {
    plugins: [vue()],
    resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    server: {
      port: 5173, // editor dev server
      fs: { allow: ['..'] },
    },
  }
})
