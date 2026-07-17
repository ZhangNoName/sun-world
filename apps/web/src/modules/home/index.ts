import type { AppModule } from '../types'

const importHomePage = () => import('./pages/HomePage')
const loadHomePage = () =>
  importHomePage().then((module) => ({ Component: module.HomePage }))

export const homeModule: AppModule = {
  id: 'home',
  name: '首页',
  routes: [
    {
      path: '/',
      lazy: loadHomePage,
      meta: {
        module: 'home',
        title: 'Sun World',
        description: '个人技术博客与工程实践记录。',
      },
    },
    {
      path: '/home',
      lazy: loadHomePage,
      meta: { module: 'home', title: '首页 - Sun World' },
    },
  ],
  seo: { title: 'Sun World' },
  preload: importHomePage,
}
