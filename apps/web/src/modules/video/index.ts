import type { AppModule } from '../types'

const VideoPage = () => import('./pages/VideoPage.vue')

/**
 * Video module - public video playback page and player shell.
 */
export const videoModule: AppModule = {
  id: 'video',
  name: '视频',
  routes: [
    {
      path: '/video',
      component: VideoPage,
      meta: {
        module: 'video',
        title: '视频 - Sun World',
      },
    },
  ],
  seo: {
    title: '视频 - Sun World',
  },
  preload: VideoPage,
}
