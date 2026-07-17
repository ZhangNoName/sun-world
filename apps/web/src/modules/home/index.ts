import { createPendingRouteComponent } from '@/app/router/route-pending'
import type { AppModule } from '../types'

const HomePage = createPendingRouteComponent('Sun World')

export const homeModule: AppModule = {
  id: 'home',
  name: '首页',
  routes: [
    {
      path: '/',
      Component: HomePage,
      meta: {
        module: 'home',
        title: 'Sun World',
        description: '个人技术博客与工程实践记录。',
      },
    },
    {
      path: '/home',
      Component: HomePage,
      meta: { module: 'home', title: '首页 - Sun World' },
    },
  ],
  seo: { title: 'Sun World' },
}
