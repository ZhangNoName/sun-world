import type { AppModule } from '../types'

const AigcPage = () => import('./pages/AigcPage.vue')

/**
 * AI module - AI chat and generation workflows.
 */
export const aiModule: AppModule = {
  id: 'ai',
  name: 'AI',
  routes: [
    {
      path: '/aigc',
      component: AigcPage,
      meta: {
        module: 'ai',
        title: 'AI 对话 - Sun World',
        hideFooter: true,
        hideHeader: true,
        className: 'ai-chat-page-wrapper',
      },
    },
  ],
  nav: [{ label: 'AI', path: '/aigc', icon: 'message-circle' }],
  seo: {
    title: 'AI 对话 - Sun World',
    description: '使用 AI 辅助创作与问答。',
  },
  preload: AigcPage,
}
