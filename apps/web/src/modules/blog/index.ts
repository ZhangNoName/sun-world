import type { AppModule } from '../types'

const BlogDetailPage = () => import('./pages/BlogDetailPage.vue')
const ArticleEditorPage = () => import('./pages/ArticleEditorPage.vue')

/**
 * Blog module - public-facing blog pages.
 *
 * Blog module owned public pages.
 */
export const blogModule: AppModule = {
  id: 'blog',
  name: '博客',
  routes: [
    {
      path: '/blog',
      component: BlogDetailPage,
      meta: {
        module: 'blog',
        title: '博客详情 - Sun World',
        description: '浏览 Sun World 的技术博客文章，覆盖前端、后端、AI、图形编辑器和工程实践。',
      },
    },
    {
      path: '/new_article',
      component: ArticleEditorPage,
      meta: {
        module: 'blog',
        title: '撰写文章 - Sun World',
        description: '在 Sun World 创建一篇新的技术博客文章。',
      },
    },
  ],
  nav: [
    { label: 'nav.blog', path: '/blog', icon: 'blog' },
  ],
  seo: {
    title: '博客 - Sun World',
    description: '浏览技术博客文章，涵盖前端、后端、AIGC 等主题。',
  },
  preload: BlogDetailPage,
}
