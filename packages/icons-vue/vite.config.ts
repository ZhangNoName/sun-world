import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import path from 'path'

// 判断是否是打包库模式
const isLib = process.env.BUILD_LIB === 'true'

export default defineConfig({
  plugins: [
    vue(),
    dts({
      outDir: 'dist/types',
      insertTypesEntry: true,
      include: ['src'], // 不生成 play 的类型
    }),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },

  // ⚡ 关键：根据是否是 lib mode 切换输入文件
  build: isLib
    ? {
        lib: {
          entry: path.resolve(__dirname, 'src/index.ts'),
          name: 'IconsVue',
          fileName: (format) => `icons-vue.${format}.js`,
        },
        rollupOptions: {
          external: ['vue'],
          output: {
            globals: {
              vue: 'Vue',
            },
          },
        },
      }
    : {
        // 🚀 预览模式：正常打包整个应用
        outDir: 'dist-preview',
      },

  // 预览模式专用
  server: {
    port: 2333,
  },

  // ⚡ 重点：dev 模式入口文件
  optimizeDeps: {
    entries: isLib ? ['src/index.ts'] : ['main.ts'],
  },
})
