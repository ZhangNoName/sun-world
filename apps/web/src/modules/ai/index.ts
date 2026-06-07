import type { AppModule } from '../types'

const AigcPage = () => import('@/pages/aigc/index.vue')

/**
 * AI module - AI chat and generation workflows.
 *
 * Phase 1 references existing legacy AIGC page.
 * Phase 2 will add dedicated AI feature pages.
 */
export const aiModule: AppModule = {
  id: 'ai',
  name: 'AI',
  routes: [
    {
      path: '/aigc',
      component: AigcPage,
      meta: { module: 'ai', title: 'AI 对话 - Sun World' },
    },
  ],
  nav: [
    { label: 'nav.ai', path: '/aigc', icon: 'ai' },
  ],
  seo: {
    title: 'AI 对话 - Sun World',
    description: '使用 AI 辅助创作与问答。',
  },
  preload: AigcPage,
}
