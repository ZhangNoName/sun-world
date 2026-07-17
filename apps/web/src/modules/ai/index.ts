import { createPendingRouteComponent } from '@/app/router/route-pending'
import type { AppModule } from '../types'

export const aiModule: AppModule = {
  id: 'ai',
  name: 'AI',
  routes: [
    {
      path: '/aigc',
      Component: createPendingRouteComponent('AI 对话'),
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
}
