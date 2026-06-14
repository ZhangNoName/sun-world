import type { RouteRecordRaw } from 'vue-router'

// ---- Core lazy page imports (existing legacy pages) ----
// Feature-owned routes such as home, blog, AI, account, admin, editor, and video are
// registered by module manifests under src/modules.

const GameTiles = () => import('@/pages/gameTiles/index.vue')
const Keep = () => import('@/pages/keep/keep.vue')
const ToolsPage = () => import('@/pages/tools/tools.page.vue')
const NotFound = () => import('@/router/NotFound.vue')

// ---- Route definitions ----

export const routes: RouteRecordRaw[] = [
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
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFound,
    meta: { title: '页面未找到 - Sun World' },
  },
]
