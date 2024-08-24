import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/pages/home/index.vue'
import Blog from '@/pages/blog/index.vue'
import AIGC from '@/pages/aigc/index.vue'
import NewArticle from '@/pages/article/index.vue'
import NotFound from './NotFound.vue'
const routes = [
  { path: '/', component: Home },
  { path: '/blog', component: Blog },
  { path: '/new_article', component: NewArticle },
  { path: '/aigc', component: AIGC },
  // 其他路由配置
  { path: '/:pathMatch(.*)*', name: 'NotFound', component: NotFound },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
