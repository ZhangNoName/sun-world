import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000, // 您可以选择其他端口
    open: false, // 是否自动在浏览器中打开
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  plugins: [vue()],
})
