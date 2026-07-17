import { lazy } from 'react'
import type { AppModule } from '../types'
const VideoPage = lazy(() => import('./pages/VideoPage'))
export const videoModule: AppModule = {
  id: 'video',
  name: '视频',
  routes: [
    {
      path: '/video',
      Component: VideoPage,
      meta: { module: 'video', title: '视频 - Sun World' },
    },
  ],
  seo: { title: '视频 - Sun World' },
}
