import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { canonicalUrl } from '@/shared/seo'
import { formatDate } from '@/util/function'
import { fetchBlogById } from '../api'
import type { BlogDetail, MarkdownHeadingItem } from '../types'

const emptyBlog = {
  author: '',
  abstract: '',
  byte_num: 0,
  category: null,
  comment_num: 0,
  content: '',
  created_at: '',
  id: 0,
  tag: [],
  title: '',
  updated_at: '',
  view_num: 0,
} as BlogDetail

export function useBlogReader(id: string) {
  const blogPreview = useRef<HTMLDivElement>(null)
  const [catalog, setCatalog] = useState<MarkdownHeadingItem[]>([])
  const [activeHeadingId, setActiveHeadingId] = useState('')
  const [loading, setLoading] = useState(false)
  const [blogInfo, setBlogInfo] = useState<BlogDetail>(emptyBlog)
  const articleCanonical = canonicalUrl(
    id ? `/blog/${encodeURIComponent(id)}` : '/blog'
  )
  const articleDescription =
    blogInfo.abstract || blogInfo.title || '浏览 Sun World 的技术博客文章。'

  const loadBlog = useCallback(async () => {
    if (!id) throw new Error('UNSPECIFIED_BLOG_ID')
    setLoading(true)
    try {
      setBlogInfo(await fetchBlogById(id))
    } finally {
      setLoading(false)
    }
  }, [id])

  const scrollToHeading = useCallback((headingId: string) => {
    const target = blogPreview.current?.querySelector<HTMLElement>(
      `#${CSS.escape(headingId)}`
    )
    const root = document.querySelector<HTMLElement>('.app-container')
    if (!target || !root) return
    root.scrollTo({
      top:
        root.scrollTop +
        target.getBoundingClientRect().top -
        root.getBoundingClientRect().top -
        88,
      behavior: 'smooth',
    })
    setActiveHeadingId(headingId)
  }, [])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.app-container')
    if (!root || !catalog.length) return
    const update = () => {
      const headings = Array.from(
        blogPreview.current?.querySelectorAll<HTMLElement>(
          'h1,h2,h3,h4,h5,h6'
        ) ?? []
      )
      setActiveHeadingId(
        headings
          .filter((heading) => heading.getBoundingClientRect().top <= 96)
          .at(-1)?.id ??
          headings[0]?.id ??
          ''
      )
    }
    root.addEventListener('scroll', update, { passive: true })
    update()
    return () => root.removeEventListener('scroll', update)
  }, [catalog])

  return useMemo(
    () => ({
      blogPreview,
      catalog,
      activeHeadingId,
      loading,
      blogInfo,
      articleCanonical,
      articleDescription,
      publishedAt: blogInfo.created_at ? formatDate(blogInfo.created_at) : '-',
      commentCount: blogInfo.comment_num ?? 0,
      wordCount: Number(blogInfo.byte_num ?? blogInfo.content.length),
      handlePreviewCatalog: setCatalog,
      scrollToHeading,
      loadBlog,
    }),
    [
      activeHeadingId,
      articleCanonical,
      articleDescription,
      blogInfo,
      catalog,
      loadBlog,
      loading,
      scrollToHeading,
    ]
  )
}
