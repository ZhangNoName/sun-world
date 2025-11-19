import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'

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
      fs: {
        // 允许访问 monorepo 外的文件
        allow: ['..'],
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    plugins: [
      vue(),
      createSvgIconsPlugin({
        // 多目录支持，可以按功能模块拆分
        iconDirs: [
          resolve(process.cwd(), 'src/assets/svgs'), // 所有 svg 放这里
        ],
        // symbolId 格式，可区分目录
        symbolId: '[name]',
        inject: 'body-last',
        customDomId: 'global-svg-icons',
        // ✅ 关键点：去掉 fill / stroke 固定颜色
        svgoOptions: {
          plugins: [
            { name: 'removeAttrs', params: { attrs: '(fill|stroke)' } },
          ],
        },
      }),
      visualizerPlugin,
    ],
    optimizeDeps: {
      // 确保 vite 处理 editor 源码，HMR 生效
      include: ['@sun-world/editor', '@sun-world/icons'],
    },
  }
})
