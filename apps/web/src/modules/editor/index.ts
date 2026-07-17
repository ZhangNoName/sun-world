import { lazy } from 'react'
import type { AppModule } from '../types'

const EditorCanvasPage = lazy(() => import('./pages/EditorCanvasPage'))
export const editorModule: AppModule = {
  id: 'editor',
  name: '编辑器',
  routes: [
    {
      path: '/canvas',
      Component: EditorCanvasPage,
      meta: {
        module: 'editor',
        title: '画布 - Sun World',
        hideFooter: true,
        hideHeader: true,
        noIndex: true,
        className: 'canvas-page-wrapper',
      },
    },
  ],
  nav: [{ label: 'nav.editor', path: '/canvas', icon: 'editor' }],
  seo: { title: '画布 - Sun World', noIndex: true },
}
