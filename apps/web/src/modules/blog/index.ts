import { createPendingRouteComponent } from '@/app/router/route-pending'
import type { AppModule } from '../types'

const BlogDetailPage = createPendingRouteComponent('博客详情')
const ArticleEditorPage = createPendingRouteComponent('撰写文章')

export const blogModule: AppModule = {
  id: 'blog',
  name: '博客',
  routes: [
    {
      path: '/blog/:id',
      Component: BlogDetailPage,
      meta: { module: 'blog', title: '博客详情 - Sun World' },
    },
    {
      path: '/blog',
      Component: BlogDetailPage,
      meta: { module: 'blog', title: '博客详情 - Sun World' },
    },
    {
      path: '/new_article',
      Component: ArticleEditorPage,
      meta: { module: 'blog', title: '撰写文章 - Sun World' },
    },
  ],
  nav: [{ label: 'nav.blog', path: '/blog', icon: 'blog' }],
  seo: { title: '博客 - Sun World', description: '浏览技术博客文章。' },
}
