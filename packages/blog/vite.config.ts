import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
import fs from 'fs'

// ⭐ 读取 package.json 的 version
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const version = `${pkg.version}`
const root = process.cwd()
const packagesDir = resolve(root, '../..') // 假设 blog 在 packages/blog/
// ⭐ Type for rollup manualChunks（解决 TS 报错）
type ManualChunksFn = (id: string) => string | undefined

export default defineConfig(({ mode }) => {
  // 加载 .env.[mode] 文件
  const env = loadEnv(mode, process.cwd())

  const isProd = mode === 'production'
  const isNeedVisualizer = mode === 'visualizer'

  // rollup-plugin-visualizer 插件可视化分析（只在 mode=visualizer 时开启）
  const visualizerPlugin =
    (isNeedVisualizer &&
      visualizer({
        open: true,
        gzipSize: true,
        brotliSize: true,
      })) ||
    null

  return {
    esbuild: {
      // 生产模式移除 console 和 debugger
      drop: isProd ? ['console', 'debugger'] : [],
    },

    server: {
      host: '0.0.0.0',
      port: 3000,
      open: false,
      watch: {
        usePolling: true,
      },
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'transequatorial-jeanice-enabling.ngrok-free.dev',
      ],
      fs: {
        allow: ['..'],
      },
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@sun-world/icons': resolve(__dirname, '../icons/src'),
        '@sun-world/editor': resolve(__dirname, '../editor/src'),
      },
    },

    plugins: [
      vue(),

      // SVG 图标插件
      createSvgIconsPlugin({
        iconDirs: [resolve(process.cwd(), 'src/assets/svgs')],
        symbolId: '[name]',
        inject: 'body-last',
        customDomId: 'global-svg-icons',

        // 去掉 fill/stroke 固定颜色，使 SVG 可全局变色
        svgoOptions: {
          plugins: [
            { name: 'removeAttrs', params: { attrs: '(fill|stroke)' } },
          ],
        },
      }),

      visualizerPlugin,
    ],

    optimizeDeps: {
      exclude: ['@sun-world/editor'],
    },

    build: {
      target: 'esnext',
      cssTarget: 'chrome61',

      // ⭐ 使用 Terser 替代 esbuild，压缩效果更好
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          // 彻底移除 console.log
          pure_funcs: ['console.log'],
          passes: 3, // 多次优化
        },
        format: {
          comments: false,
        },
      },

      chunkSizeWarningLimit: 2000,

      rollupOptions: {
        output: {
          entryFileNames: `assets/[name].v${version}.[hash].js`,
          chunkFileNames: `assets/[name].v${version}.[hash].js`,
          assetFileNames: `assets/[name].v${version}.[hash].[ext]`,

          /**
           * ⭐ 手动拆包策略 (manualChunks)
           * - TS 收窄类型到 ManualChunksFn
           * - 确保不会报错
           */
          manualChunks: ((id: string) => {
            // 只处理 node_modules
            if (id.includes('node_modules')) {
              if (id.includes('echarts')) return 'echarts'
              if (id.includes('element-plus')) return 'element'
              if (id.includes('axios')) return 'vendor-axios'
              if (id.includes('dayjs')) return 'vendor-dayjs'
              if (id.includes('@sun-world/editor')) return 'editor'
              if (id.includes('@sun-world/icons')) return 'icons'
              if (id.includes('vditor')) return 'vditor'
              if (id.includes('lodash')) return 'lodash'
              if (id.includes('langchain') || id.includes('langsmith'))
                return 'langchain'
              if (id.includes('zrender')) return 'zrender'

              // 其余全部放 vendor
              return 'vendor'
            }
            // 小页面组件合并到 index
            // pages 下的 vue 文件全部合并到 index
            if (/src\/pages\/.+\.vue$/.test(id)) {
              return 'index'
            }
          }) as ManualChunksFn,
        },
      },
    },
  }
})
