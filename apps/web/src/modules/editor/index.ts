import { createPendingRouteComponent } from '@/app/router/route-pending'
import type { AppModule } from '../types'

export const editorModule: AppModule = {
  id: 'editor',
  name: '编辑器',
  routes: [
    {
      path: '/canvas',
      Component: createPendingRouteComponent('画布编辑器'),
      meta: {
        module: 'editor',
        title: '画布 - Sun World',
        hideFooter: true,
        hideHeader: true,
        className: 'canvas-page-wrapper',
      },
    },
  ],
  nav: [{ label: 'nav.editor', path: '/canvas', icon: 'editor' }],
  seo: { title: '画布 - Sun World', noIndex: true },
}
