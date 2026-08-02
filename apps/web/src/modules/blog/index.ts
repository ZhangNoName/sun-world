import type { AppModule } from '../types'

const detail = () =>
  import('./pages/BlogDetailPage').then((module) => ({
    Component: module.BlogDetailPage,
  }))
const editor = () =>
  import('./pages/ArticleEditorPage').then((module) => ({
    Component: module.ArticleEditorPage,
  }))

export const blogModule: AppModule = {
  id: 'blog',
  name: '博客',
  routes: [
    {
      path: '/blog/:id',
      lazy: detail,
      meta: {
        module: 'blog',
        title: '博客详情 - Sun World',
        className: 'blog-page-wrapper',
      },
    },
    {
      path: '/blog',
      lazy: detail,
      meta: {
        module: 'blog',
        title: '博客详情 - Sun World',
        className: 'blog-page-wrapper',
      },
    },
    {
      path: '/new_article',
      lazy: editor,
      meta: {
        module: 'blog',
        title: '撰写文章 - Sun World',
        className: 'blog-page-wrapper',
      },
    },
    {
      path: '/write',
      lazy: editor,
      meta: {
        module: 'blog',
        title: 'Write Article - Sun World',
        className: 'blog-page-wrapper',
      },
    },
  ],
  nav: [{ label: 'nav.blog', path: '/blog', icon: 'blog' }],
  seo: { title: '博客 - Sun World', description: '浏览技术博客文章。' },
}
