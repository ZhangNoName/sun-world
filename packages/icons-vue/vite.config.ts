import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import path from 'path'
import { resolve } from 'path'
export default defineConfig({
  plugins: [
    vue(),
    dts({
      outputDir: 'dist',
      insertTypesEntry: true,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'IconsVue',
      fileName: (format) => `icons-vue.${format}.js`,
    },
    rollupOptions: {
      external: ['vue'], // 避免 Vue 被打包进来
      output: {
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
})
