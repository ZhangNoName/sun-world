import { createRouter, createWebHistory } from 'vue-router';
import Home from '@/pages/home/index.vue';
import Blog from '@/pages/blog/index.vue';

const routes = [
  { path: '/', component: Home },
  { path: '/blog', component: Blog }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;