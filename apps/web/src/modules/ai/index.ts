import type { AppModule } from '../types'

const importPage = () => import('./pages/AigcPage')
const page = () =>
  importPage().then((module) => ({ Component: module.AigcPage }))

export const aiModule: AppModule = {
  id: 'ai',
  name: 'AI',
  routes: [
    {
      path: '/aigc',
      lazy: page,
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
  preload: importPage,
}
