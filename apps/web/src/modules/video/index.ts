import { createPendingRouteComponent } from '@/app/router/route-pending'
import type { AppModule } from '../types'

export const videoModule: AppModule = {
  id: 'video',
  name: '视频',
  routes: [
    {
      path: '/video',
      Component: createPendingRouteComponent('视频'),
      meta: { module: 'video', title: '视频 - Sun World' },
    },
  ],
  seo: { title: '视频 - Sun World' },
}
