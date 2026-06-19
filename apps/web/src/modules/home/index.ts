import type { AppModule } from '../types'

const HomePage = () => import('./pages/HomePage.vue')

/**
 * Home module - landing/home route shell and sidebar widgets.
 */
export const homeModule: AppModule = {
  id: 'home',
  name: '首页',
  routes: [
    {
      path: '/',
      component: HomePage,
      meta: {
        module: 'home',
        title: 'Sun World',
        description:
          '尝试全栈开发, 精通vue ,react, 擅长React Native, Python, 熟练AIGC实践及代码编辑器深度解析的个人技术博客。',
      },
    },
    {
      path: '/home',
      component: HomePage,
      meta: {
        module: 'home',
        title: '首页 - Sun World',
      },
    },
  ],
  seo: {
    title: 'Sun World',
  },
  preload: HomePage,
}
