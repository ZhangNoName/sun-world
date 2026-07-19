import { useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { SunIcon } from '@sun-world/icons/react'
import { SunLoadingSkeleton } from '@sun-world/ui/loading-skeleton'
import { toast } from '@sun-world/ui/toast'

import { SunMarkdownPreview } from '@/shared/markdown'
import { buildBlogPostingJsonLd, useJsonLd, usePageMeta } from '@/shared/seo'
import { getBlogErrorMessage } from '../errors'
import { useBlogReader } from '../composables/useBlogReader'
import { CatalogCard } from '../ui/CatalogCard'
import '../styles/blog-experience.css'

export function BlogDetailPage() {
  const params = useParams()
  const [search] = useSearchParams()
  const id = params.id || search.get('id') || ''
  const reader = useBlogReader(id)
  usePageMeta({
    title: reader.blogInfo.title
      ? `${reader.blogInfo.title} - Sun World`
      : '博客详情 - Sun World',
    description: reader.articleDescription,
    canonical: reader.articleCanonical,
    ogType: 'article',
  })
  useJsonLd(
    reader.blogInfo.id
      ? buildBlogPostingJsonLd({
          title: reader.blogInfo.title,
          description: reader.articleDescription,
          author: reader.blogInfo.author,
          datePublished: reader.blogInfo.created_at,
          dateModified: reader.blogInfo.updated_at,
          canonicalUrl: reader.articleCanonical,
          wordCount: reader.wordCount,
        })
      : null,
    'blog-posting'
  )
  useEffect(() => {
    if (!id) {
      toast.error('未找到相应的博客 id')
      return
    }
    void reader
      .loadBlog()
      .catch((error) => toast.error(getBlogErrorMessage(error)))
  }, [id, reader.loadBlog])
  return (
    <div className="blog-page">
      <aside className="blog-page__catalog">
        <CatalogCard
          catalog={reader.catalog}
          activeId={reader.activeHeadingId}
          onSelect={reader.scrollToHeading}
        />
      </aside>
      <main className="blog-page__article">
        {reader.loading ? (
          <SunLoadingSkeleton lines={5} />
        ) : (
          <>
            <header className="article-header">
              <div className="blog-meta article-header__meta">
                <span>
                  <SunIcon name="calendar" />
                  {reader.publishedAt}
                </span>
                <span>
                  <SunIcon name="message-circle" />
                  {reader.commentCount}
                </span>
                <span>
                  <SunIcon name="file-text" />
                  {reader.wordCount}
                </span>
              </div>
              <h1>{reader.blogInfo.title}</h1>
            </header>
            <div ref={reader.blogPreview} className="preview-container">
              <SunMarkdownPreview
                content={reader.blogInfo.content}
                onCatalog={reader.handlePreviewCatalog}
              />
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default BlogDetailPage
