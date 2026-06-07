import type { AppModule } from '../types'

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
      component: () => import('@/pages/canvas/canvas.vue'),
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
  },
}
