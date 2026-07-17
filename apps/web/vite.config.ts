import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type PluginOption } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
const version = pkg.version
const routeOnlyChunk = /(?:^|\/)(?:page-(?:game-tiles|tools|keep|login|register|me|qq-callback)|manage-shell|admin-charts|video-player|tile-export|md-editor-(?:preview|editor)|echarts|zrender)\./

function stripRouteOnlyPreloadsPlugin() {
  return {
    name: 'sun-world-strip-route-only-preloads',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html.split('\n').filter((line) => !routeOnlyChunk.test(line)).join('\n')
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const production = mode === 'production'
  const plugins: PluginOption[] = [react()]
  if (mode === 'visualizer') plugins.push(visualizer({ open: true, gzipSize: true, brotliSize: true }) as never)
  if (production) plugins.push(stripRouteOnlyPreloadsPlugin())
  return {
    esbuild: { drop: production ? ['console', 'debugger'] : [] },
    server: {
      host: '0.0.0.0', port: 3000, open: false, watch: { usePolling: true },
      allowedHosts: ['localhost', '127.0.0.1', 'transequatorial-jeanice-enabling.ngrok-free.dev'],
      proxy: { '/api': { target: env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000', changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, '') } },
      fs: { allow: ['..'] },
    },
    resolve: { alias: {
      '@': resolve(__dirname, 'src'),
      '@sun-world/icons': resolve(__dirname, '../../packages/icons/src'),
      '@sun-world/contracts': resolve(__dirname, '../../packages/contracts/src'),
      '@sun-world/editor': resolve(__dirname, '../../packages/editor/src'),
      '@sun-world/ui': resolve(__dirname, '../../packages/ui/src'),
    } },
    plugins,
    optimizeDeps: { exclude: ['@sun-world/editor'] },
    build: {
      modulePreload: { resolveDependencies: (_filename, dependencies) => dependencies.filter((dependency) => !routeOnlyChunk.test(dependency)) },
      target: 'esnext', cssTarget: 'chrome61', minify: 'terser',
      terserOptions: { compress: { drop_console: true, drop_debugger: true, pure_funcs: ['console.log'], passes: 1 }, format: { comments: false } },
      chunkSizeWarningLimit: 2000,
      rollupOptions: { output: {
        entryFileNames: `assets/[name].v${version}.[hash].js`, chunkFileNames: `assets/[name].v${version}.[hash].js`, assetFileNames: `assets/[name].v${version}.[hash].[ext]`,
        manualChunks(id: string) {
          const path = id.replaceAll('\\', '/')
          const web = path.includes('/apps/web/src/')
          if (path.includes('/packages/icons/src/')) return 'icons'
          if (path.includes('/packages/contracts/src/')) return 'contracts'
          if (path.includes('/packages/editor/src/')) return 'editor'
          if (web && path.includes('/src/app/router/')) return 'app-router'
          if (web && (path.includes('/src/modules/registry.ts') || path.includes('/src/modules/types.ts') || /\/src\/modules\/[^/]+\/index\.ts$/.test(path))) return 'module-registry'
          if (web && path.includes('/src/pages/gameTiles/index.tsx')) return 'page-game-tiles'
          if (web && path.includes('/src/pages/tools/tools.page.tsx')) return 'page-tools'
          if (web && path.includes('/src/pages/keep/keep.tsx')) return 'page-keep'
          if (web && path.includes('/src/pages/login/login.tsx')) return 'page-login'
          if (web && path.includes('/src/pages/login/register.tsx')) return 'page-register'
          if (web && path.includes('/src/pages/login/qqCb.tsx')) return 'page-qq-callback'
          if (web && path.includes('/src/pages/me/me.tsx')) return 'page-me'
          if (web && path.includes('/src/pages/manage/')) return 'manage-shell'
          if (web && (path.includes('/src/modules/admin/pages/AdminChartsPage.tsx') || path.includes('/src/modules/admin/ui/ChartsCard.tsx'))) return 'admin-charts'
          if (web && path.includes('/src/modules/video/')) return 'video-player'
          if (web && path.includes('/src/modules/blog/pages/ArticleEditorPage.tsx')) return 'md-editor-editor'
          if (!path.includes('node_modules')) return undefined
          if (path.includes('@uiw/react-md-editor') || path.includes('@codemirror')) return 'md-editor-editor'
          if (/\/(?:react-markdown|remark-|rehype-|unified|micromark|mdast-|hast-|unist-)/.test(path)) return 'md-editor-preview'
          if (path.includes('artplayer') || path.includes('hls.js')) return 'video-player'
          if (path.includes('jszip')) return 'tile-export'
          if (path.includes('echarts')) return 'echarts'
          if (path.includes('zrender')) return 'zrender'
          if (path.includes('axios')) return 'vendor-axios'
          if (path.includes('react') || path.includes('scheduler')) return 'vendor-react'
          return 'vendor'
        },
      } },
    },
  }
})
