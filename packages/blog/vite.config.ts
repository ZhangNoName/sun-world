import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
// import tsconfigPaths from 'vite-tsconfig-paths'
// https://vitejs.dev/config/

export default defineConfig(({ mode }) => {
  // 加载对应模式的 .env 文件变量
  const env = loadEnv(mode, process.cwd())
  const isProd = mode === 'production'
  const isNeedVisualizer = mode === 'visualizer'
  const visualizerPlugin =
    (isNeedVisualizer &&
      visualizer({
        open: true, // 构建完成后自动打开浏览器
        gzipSize: true, // 统计 gzip 压缩后的大小
        brotliSize: true, // 统计 brotli 压缩后的大小
      })) ||
    null
  return {
    esbuild: {
      drop: isProd ? ['console', 'debugger'] : [],
    },
    server: {
      host: '0.0.0.0',
      port: 3000, // 您可以选择其他端口
      open: false, // 是否自动在浏览器中打开
      watch: {
        usePolling: true, // 有时候在WSL、Docker下必开
      },
      allowedHosts: [
        'localhost', // 保留默认值
        '127.0.0.1', // 保留默认值
        // 添加你的 ngrok 域名
        'transequatorial-jeanice-enabling.ngrok-free.dev',
      ],
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@sun-world/icons-vue': resolve(__dirname, '../icons-vue/src'),
      },
    },
    plugins: [vue(), visualizerPlugin],
  }
})
