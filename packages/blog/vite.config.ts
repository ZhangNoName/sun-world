import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
// import tsconfigPaths from 'vite-tsconfig-paths'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000, // 您可以选择其他端口
    open: false, // 是否自动在浏览器中打开
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@sun-world/icons-vue': resolve(__dirname, '../icons-vue/src'),
    },
  },
  plugins: [
    vue(),

    // tsconfigPaths(),
    // // 自动导入 Vue 相关 API 以及 Element Plus API（如 ElMessage、ElNotification）
    // AutoImport({
    //   resolvers: [ElementPlusResolver()],
    //   dts: 'src/auto-imports.d.ts',
    // }),
    // // 自动注册 Element Plus 组件
    // Components({
    //   resolvers: [ElementPlusResolver()],
    //   dts: 'src/components.d.ts',
    // }),
  ],
})
