import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/pages/home/index.vue'
import Blog from '@/pages/blog/index.vue'
import AIGC from '@/pages/aigc/index.vue'
import NewArticle from '@/pages/article/index.vue'
import GameTiles from '@/pages/gameTiles/index.vue'
import Manage from '@/pages/manage/index.vue'
import NotFound from './NotFound.vue'
import Login from '@/pages/login/login.vue'
import Keep from '@/pages/keep/keep.vue'
import Me from '@/pages/me/me.vue'
import Canvas from '@/pages/canvas/canvas.vue'
import ToolsPage from '@/pages/tools/tools.page.vue'
const routes = [
  { path: '/', component: Home },

  { path: '/home', component: Home },
  { path: '/blog', component: Blog },
  { path: '/new_article', component: NewArticle },
  { path: '/aigc', component: AIGC },
  { path: '/game_tiles', component: GameTiles },
  { path: '/manage', component: Manage },
  { path: '/login', component: Login },
  { path: '/me', component: Me },
  {
    path: '/tools',
    component: ToolsPage,
  },
  {
    path: '/canvas',
    component: Canvas,
    meta: {
      hideFooter: true,
      hideHeader: true,
      className: 'canvas-page-wrapper',
    },
  },
  { path: '/keep', component: Keep },

  // 其他路由配置
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFound },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    else return { top: 0 }
  },
})

export default router
