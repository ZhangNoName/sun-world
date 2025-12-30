import { createRouter, createWebHistory } from 'vue-router'

const Home = () => import(/* webpackPrefetch: true */ '@/pages/home/index.vue')
const Blog = () => import(/* webpackPrefetch: true */ '@/pages/blog/index.vue')

const AIGC = () => import('@/pages/aigc/index.vue')
const NewArticle = () => import('@/pages/article/index.vue')
const GameTiles = () => import('@/pages/gameTiles/index.vue')
const Manage = () => import('@/pages/manage/index.vue')
const Login = () => import('@/pages/login/login.vue')
const Register = () => import('@/pages/login/register.vue')
const Keep = () => import('@/pages/keep/keep.vue')
const Me = () => import('@/pages/me/me.vue')
const Canvas = () => import('@/pages/canvas/canvas.vue')
const ToolsPage = () => import('@/pages/tools/tools.page.vue')
const NotFound = () => import('@/router/NotFound.vue')

// 🔥 如果你想额外预加载某个页面，只需要打开这个
// const preloadBlog = () => import('@/pages/blog/index.vue')

const routes = [
  { path: '/', component: Home },

  { path: '/home', component: Home },
  { path: '/blog', component: Blog },
  { path: '/new_article', component: NewArticle },
  { path: '/aigc', component: AIGC },
  { path: '/game_tiles', component: GameTiles },
  { path: '/manage', component: Manage },
  { path: '/login', component: Login },
  { path: '/register', component: Register },
  { path: '/me', component: Me },
  { path: '/tools', component: ToolsPage },
  { path: '/keep', component: Keep },
  {
    path: '/register',
    component: Register,
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

  // 404
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFound },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
})

export default router
