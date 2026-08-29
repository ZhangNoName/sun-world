import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useReducedMotion } from '@/shared/design'
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
  const requestId = useRef(0)
  const prefersReducedMotion = useReducedMotion()
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
    const currentId = ++requestId.current
    setLoading(true)
    try {
      const next = await fetchBlogById(id)
      if (currentId === requestId.current) setBlogInfo(next)
    } catch (error) {
      if (currentId === requestId.current) throw error
    } finally {
      if (currentId === requestId.current) setLoading(false)
    }
  }, [id])

  useEffect(
    () => () => {
      requestId.current += 1
    },
    []
  )

  const scrollToHeading = useCallback(
    (headingId: string) => {
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
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
      })
      setActiveHeadingId(headingId)
    },
    [prefersReducedMotion]
  )

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.app-container')
    if (!root || !catalog.length) return
    let frameId: number | null = null
    const update = () => {
      frameId = null
      const headings = Array.from(
        blogPreview.current?.querySelectorAll<HTMLElement>(
          'h1,h2,h3,h4,h5,h6'
        ) ?? []
      )
      const nextHeadingId =
        headings
          .filter((heading) => heading.getBoundingClientRect().top <= 96)
          .at(-1)?.id ??
        headings[0]?.id ??
        ''
      setActiveHeadingId((current) =>
        current === nextHeadingId ? current : nextHeadingId
      )
    }
    const scheduleUpdate = () => {
      if (frameId !== null) return
      frameId = window.requestAnimationFrame(update)
    }
    root.addEventListener('scroll', scheduleUpdate, { passive: true })
    scheduleUpdate()
    return () => {
      root.removeEventListener('scroll', scheduleUpdate)
      if (frameId !== null) window.cancelAnimationFrame(frameId)
    }
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
