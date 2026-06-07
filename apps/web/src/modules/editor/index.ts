import type { AppModule } from '../types'

const CanvasPage = () => import('@/pages/canvas/canvas.vue')

/**
 * Editor module - canvas and rich-editor integration.
 *
 * Phase 1 references the existing canvas page.
 * Future phases will add graphics editor features.
 */
export const editorModule: AppModule = {
  id: 'editor',
  name: '编辑器',
  routes: [
    {
      path: '/canvas',
      component: CanvasPage,
      meta: {
        module: 'editor',
        title: '画布 - Sun World',
        hideFooter: true,
        hideHeader: true,
        className: 'canvas-page-wrapper',
      },
    },
  ],
  nav: [
    { label: 'nav.editor', path: '/canvas', icon: 'editor' },
  ],
  seo: {
    title: '画布 - Sun World',
    description: '使用 Sun World 画布进行图形编辑、视觉实验和内容创作。',
    noIndex: true,
  },
  preload: CanvasPage,
}
