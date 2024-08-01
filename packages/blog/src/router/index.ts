import { createRouter, createWebHistory } from 'vue-router';
import Home from '@/pages/home/index.vue';
import Blog from '@/pages/blog/index.vue';
import AIGC from '@/pages/aigc/index.vue';

const routes = [
  { path: '/', component: Home },
  { path: '/blog', component: Blog },
  { path: '/new_article', component: Blog },
  { path: '/aigc', component: AIGC }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;