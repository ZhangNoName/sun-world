import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import { visualizer } from 'rollup-plugin-visualizer'
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons'
// import tsconfigPaths from 'vite-tsconfig-paths'
import fs from 'fs'

// ⭐ 读取 package.json 的 version
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'))
const version = `${pkg.version}`
const root = process.cwd()
const packagesDir = resolve(root, '../..') // blog is now under apps/web/
// ⭐ Type for rollup manualChunks（解决 TS 报错）
type ManualChunksFn = (id: string) => string | undefined

const routeOnlyPreloadPattern =
  /\/assets\/(?:page-(?:game-tiles|tools|keep|login|register|me|qq-callback)|manage-shell|admin-charts|video-player|tile-export|vditor-(?:preview|editor)|echarts|zrender|element)\./

function stripRouteOnlyPreloadsPlugin() {
  return {
    name: 'sun-world-strip-route-only-preloads',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html
        .split('\n')
        .filter((line) => !routeOnlyPreloadPattern.test(line))
        .join('\n')
    },
  }
}

export default defineConfig(({ mode }) => {
  // 加载 .env.[mode] 文件
  const env = loadEnv(mode, process.cwd())
  const devApiTarget = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000'

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
      proxy: {
        '/api': {
          target: devApiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
      fs: {
        allow: ['..'],
      },
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@sun-world/icons': resolve(__dirname, '../../packages/icons/src'),
        '@sun-world/editor': resolve(__dirname, '../../packages/editor/src'),
        '@sun-world/ui': resolve(__dirname, '../../packages/ui/src'),
      },
    },

    plugins: [
      vue(),
      // tsconfigPaths(),

      // SVG 图标插件
      createSvgIconsPlugin({
        iconDirs: [resolve(process.cwd(), 'src/assets/svgs')],
        // symbolId: '[name]',
        symbolId: 'icon-[dir]-[name]',
        inject: 'body-last',
        // customDomId: 'global-svg-icons',
        customDomId: '__svg__icons__dom__',

        // 去掉 fill/stroke 固定颜色，使 SVG 可全局变色
        svgoOptions: {
          plugins: [
            { name: 'removeAttrs', params: { attrs: '(fill|stroke)' } },
          ],
        },
      }),

      visualizerPlugin,
      isProd ? stripRouteOnlyPreloadsPlugin() : null,
    ],

    optimizeDeps: {
      exclude: ['@sun-world/editor'],
    },

    build: {
      modulePreload: {
        resolveDependencies: (_filename, deps) =>
          deps.filter(
            (dep) =>
              !/(?:^|\/)(?:page-(?:game-tiles|tools|keep|login|register|me|qq-callback)|manage-shell|admin-charts|video-player|tile-export|vditor-(?:preview|editor)|echarts|zrender|element)\./.test(
                dep
              )
          ),
      },
      target: 'esnext',
      cssTarget: 'chrome61',

      // ⭐ 使用 Terser 替代 esbuild，压缩效果更好
      // 优化：减少 passes 次数以降低内存占用（从 3 降到 1）
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          // 彻底移除 console.log
          pure_funcs: ['console.log'],
          passes: 1, // 减少优化次数以降低内存占用
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
            const normalizedId = id.replaceAll('\\', '/')
            const isWebAppSource = normalizedId.includes('/apps/web/src/')
            if (id.includes('plugin-vue:export-helper')) return 'vue-helpers'
            if (normalizedId.includes('/packages/icons/src/')) return 'icons'
            if (normalizedId.includes('/packages/contracts/src/'))
              return 'contracts'
            if (normalizedId.includes('/packages/editor/src/')) return 'editor'
            if (
              isWebAppSource &&
              normalizedId.includes('/src/baseCom/SvgIcon/')
            )
              return 'legacy-icons'
            if (
              isWebAppSource &&
              (normalizedId.includes('/src/app/router/') ||
                normalizedId.includes('/src/router/index.ts'))
            )
              return 'app-router'
            if (
              isWebAppSource &&
              (normalizedId.includes('/src/modules/registry.ts') ||
                normalizedId.includes('/src/modules/types.ts') ||
                /\/src\/modules\/[^/]+\/index\.ts$/.test(normalizedId))
            )
              return 'module-registry'
            if (isWebAppSource && normalizedId.includes('/src/shared/api/'))
              return 'shared-api'
            if (isWebAppSource && normalizedId.includes('/src/store/'))
              return 'stores'
            if (isWebAppSource && normalizedId.includes('/src/service/http.ts'))
              return 'http-client'
            if (isWebAppSource && normalizedId.includes('/src/shared/telemetry/'))
              return 'telemetry'
            if (isWebAppSource && normalizedId.includes('/src/shared/config/'))
              return 'shared-config'
            if (
              isWebAppSource &&
              (normalizedId.includes(
                '/src/modules/admin/pages/AdminChartsPage.vue'
              ) ||
                normalizedId.includes('/src/modules/admin/ui/ChartsCard.vue') ||
                normalizedId.includes('/src/modules/admin/ui/chartConfig.ts'))
            )
              return 'admin-charts'
            if (
              isWebAppSource &&
              normalizedId.includes('/src/pages/gameTiles/index.vue')
            )
              return 'page-game-tiles'
            if (
              isWebAppSource &&
              normalizedId.includes('/src/pages/tools/tools.page.vue')
            )
              return 'page-tools'
            if (
              isWebAppSource &&
              normalizedId.includes('/src/pages/keep/keep.vue')
            )
              return 'page-keep'
            if (
              isWebAppSource &&
              normalizedId.includes('/src/pages/login/login.vue')
            )
              return 'page-login'
            if (
              isWebAppSource &&
              normalizedId.includes('/src/pages/login/register.vue')
            )
              return 'page-register'
            if (
              isWebAppSource &&
              normalizedId.includes('/src/pages/login/qqCb.vue')
            )
              return 'page-qq-callback'
            if (
              isWebAppSource &&
              normalizedId.includes('/src/pages/me/me.vue')
            )
              return 'page-me'
            if (isWebAppSource && normalizedId.includes('/src/pages/manage/'))
              return 'manage-shell'
            // 只处理 node_modules
            if (id.includes('node_modules')) {
              if (id.includes('artplayer') || id.includes('hls.js'))
                return 'video-player'
              if (id.includes('jszip')) return 'tile-export'
              if (id.includes('vditor/dist/method.min'))
                return 'vditor-preview'
              if (id.includes('vditor')) return 'vditor-editor'
              if (id.includes('echarts')) return 'echarts'
              if (id.includes('element-plus')) return 'element'
              if (id.includes('axios')) return 'vendor-axios'
              if (id.includes('dayjs')) return 'vendor-dayjs'
              if (id.includes('@sun-world/editor')) return 'editor'
              if (id.includes('@sun-world/icons')) return 'icons'
              if (id.includes('lodash')) return 'lodash'
              if (id.includes('zrender')) return 'zrender'

              // 其余全部放 vendor
              return 'vendor'
            }
          }) as ManualChunksFn,
        },
      },
    },
  }
})
