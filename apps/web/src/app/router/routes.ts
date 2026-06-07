import type { RouteRecordRaw } from 'vue-router'

// ---- Core lazy page imports (existing legacy pages) ----
// Feature-owned routes such as blog, AI, account, admin, and editor are
// registered by module manifests under src/modules.

const Home = () => import(/* webpackPrefetch: true */ '@/pages/home/index.vue')
const GameTiles = () => import('@/pages/gameTiles/index.vue')
const Keep = () => import('@/pages/keep/keep.vue')
const ToolsPage = () => import('@/pages/tools/tools.page.vue')
const VideoPage = () => import('@/pages/video/video.page.vue')
const NotFound = () => import('@/router/NotFound.vue')

// ---- Route definitions ----

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: Home,
    meta: {
      title: 'Sun World',
      description: '尝试全栈开发, 精通vue ,react, 擅长React Native, Python, 熟练AIGC实践及代码编辑器深度解析的个人技术博客。',
    },
  },
  {
    path: '/home',
    component: Home,
    meta: { title: '首页 - Sun World' },
  },
  {
    path: '/game_tiles',
    component: GameTiles,
    meta: { title: '游戏 - Sun World' },
  },
  {
    path: '/tools',
    component: ToolsPage,
    meta: { title: '工具 - Sun World' },
  },
  {
    path: '/keep',
    component: Keep,
    meta: { title: '收藏 - Sun World' },
  },
  {
    path: '/video',
    component: VideoPage,
    meta: { title: '视频 - Sun World' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFound,
    meta: { title: '页面未找到 - Sun World' },
  },
]
