import react from '@vitejs/plugin-react'
import { inspectorServer } from '@react-dev-inspector/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type PluginOption } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'
import { createUiSourceAliases } from '../../packages/ui/source-aliases'
import idempotentInspectorBabelPlugin from './inspector-babel-plugin'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
}
const version = pkg.version
const routeOnlyChunk =
  /(?:^|\/)(?:page-(?:game-tiles|tools|keep|login|register|me|qq-callback)|manage-shell|admin-charts|video-player|tile-export|md-editor-(?:preview|editor)|echarts|zrender|VideoPage|jszip\.min|ArticleEditorPage|AdminChartsPage|AigcPage|AdminMetricsPage|AdminLogsPage|BlogDetailPage|EditorCanvasPage|tools\.page|keep|login|register|me|qqCb)\./

function stripRouteOnlyPreloadsPlugin() {
  return {
    name: 'sun-world-strip-route-only-preloads',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html
        .split('\n')
        .filter((line) => !routeOnlyChunk.test(line))
        .join('\n')
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const production = mode === 'production'
  const plugins: PluginOption[] = [
    react({
      babel: production
        ? undefined
        : { plugins: [idempotentInspectorBabelPlugin] },
    }),
    tailwindcss(),
  ]
  if (!production) plugins.push(inspectorServer())
  if (mode === 'visualizer')
    plugins.push(
      visualizer({ open: true, gzipSize: true, brotliSize: true }) as never
    )
  if (production) plugins.push(stripRouteOnlyPreloadsPlugin())
  return {
    esbuild: { drop: production ? ['console', 'debugger'] : [] },
    server: {
      host: '0.0.0.0',
      port: 3000,
      open: false,
      watch: { usePolling: true },
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'transequatorial-jeanice-enabling.ngrok-free.dev',
      ],
      proxy: {
        '/api': {
          target: env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
      fs: { allow: ['..'] },
    },
    resolve: {
      alias: [
        ...createUiSourceAliases(resolve(__dirname, '../../packages/ui/src')),
        { find: '@', replacement: resolve(__dirname, 'src') },
        {
          find: '@sun-world/ai-ui',
          replacement: resolve(__dirname, '../../packages/ai-ui/src'),
        },
        {
          find: '@sun-world/icons',
          replacement: resolve(__dirname, '../../packages/icons/src'),
        },
        {
          find: '@sun-world/contracts',
          replacement: resolve(__dirname, '../../packages/contracts/src'),
        },
        {
          find: '@sun-world/editor',
          replacement: resolve(__dirname, '../../packages/editor/src'),
        },
      ],
    },
    plugins,
    optimizeDeps: { exclude: ['@sun-world/editor'] },
    build: {
      modulePreload: {
        resolveDependencies: (_filename, dependencies) =>
          dependencies.filter((dependency) => !routeOnlyChunk.test(dependency)),
      },
      target: 'esnext',
      cssTarget: 'chrome61',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log'],
          passes: 1,
        },
        format: { comments: false },
      },
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          entryFileNames: `assets/[name].v${version}.[hash].js`,
          chunkFileNames: `assets/[name].v${version}.[hash].js`,
          assetFileNames: `assets/[name].v${version}.[hash].[ext]`,
        },
      },
    },
  }
})
