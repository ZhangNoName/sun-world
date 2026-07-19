import { useEffect, useRef, useState } from 'react'
import { SunIcon } from '@sun-world/icons/react'
import { SunButton } from '@sun-world/ui/button'
import { SunInput } from '@sun-world/ui/input'
import { SunLoadingSkeleton } from '@sun-world/ui/loading-skeleton'
import { SunSelect } from '@sun-world/ui/select'
import { toast } from '@sun-world/ui/toast'

import { Waterfall } from '@/components/Waterfall/waterfall'
import { useViewportWidth } from '@/shared/browser/viewport'
import { useBlogBaseData } from '../composables/useBlogBaseData'
import { useBlogList } from '../composables/useBlogList'
import type { BlogSortBy, BlogSortOrder } from '../types'
import { BlogCard } from './BlogCard'
import '../styles/blog-experience.css'

const SORT_OPTIONS = [
  { value: 'updated_at:desc', label: '最新优先' },
  { value: 'updated_at:asc', label: '最早优先' },
  { value: 'view_num:desc', label: '浏览量最高' },
]

export function BlogHomeFeed() {
  const { tagList, categoryList, loaded, loadBlogBaseData } = useBlogBaseData()
  const blog = useBlogList(tagList, categoryList, 12)
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState('updated_at:desc')
  const [showTop, setShowTop] = useState(false)
  const [mode, setMode] = useState<'list' | 'waterfall'>('list')
  const width = useViewportWidth()
  const loaderRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void loadBlogBaseData().catch(() => toast.error('获取博客基础数据失败'))
  }, [loadBlogBaseData])
  useEffect(() => {
    if (loaded)
      void blog.loadFirstPage().catch(() => toast.error('获取博客列表失败'))
  }, [loaded])

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.app-container')
    const onScroll = () => setShowTop(Boolean(root && root.scrollTop > 360))
    root?.addEventListener('scroll', onScroll, { passive: true })
    return () => root?.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (width <= 695) setMode('list')
  }, [width])

  useEffect(() => {
    if (!loaderRef.current || !blog.hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting)
          void blog.loadMore().catch(() => toast.error('加载更多失败'))
      },
      {
        root: document.querySelector('.app-container'),
        rootMargin: '1600px 0px',
      }
    )
    observer.observe(loaderRef.current)
    return () => observer.disconnect()
  }, [blog.hasMore, blog.loadMore])

  const apply = () => {
    const [sortBy, sortOrder] = sort.split(':') as [BlogSortBy, BlogSortOrder]
    void blog
      .updateQuery({ keyword, sortBy, sortOrder })
      .catch(() => toast.error('搜索失败'))
  }

  const tags = Array.from(new Set(tagList.map((tag) => tag.name))).slice(0, 12)
  return (
    <main className="blog-feed">
      <section className="summary-card" aria-label="文章标签">
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </section>
      <section className="query-panel blog-toolbar" aria-label="博客筛选">
        <SunInput
          label="搜索博客"
          value={keyword}
          onValueChange={setKeyword}
          onKeyDown={(event) => {
            if (event.key === 'Enter') apply()
          }}
          type="search"
          placeholder="搜索标题或摘要"
        />
        <SunSelect
          label="排序方式"
          value={sort}
          onValueChange={setSort}
          options={SORT_OPTIONS}
        />
        <SunButton onClick={apply}>搜索</SunButton>
      </section>
      <div className="view-config" role="group" aria-label="文章列表显示模式">
        <button
          className="view-config__button"
          type="button"
          aria-pressed={mode === 'list'}
          onClick={() => setMode('list')}
        >
          <SunIcon name="list" />
          列表
        </button>
        <button
          className="view-config__button"
          type="button"
          aria-pressed={mode === 'waterfall'}
          disabled={width <= 695}
          onClick={() => setMode('waterfall')}
        >
          <SunIcon name="columns" />
          瀑布流
        </button>
      </div>
      {blog.loading && blog.items.length === 0 ? (
        <SunLoadingSkeleton lines={4} />
      ) : null}
      {!blog.loading && blog.items.length === 0 ? (
        <p className="empty-state">暂时没有文章</p>
      ) : null}
      {mode === 'waterfall' ? (
        <Waterfall list={blog.items} columnCount={width <= 1024 ? 2 : 3} />
      ) : (
        <section className="blog-list">
          {blog.items.map((item) => (
            <BlogCard key={item.id} {...item} />
          ))}
        </section>
      )}
      <div ref={loaderRef} className="loader-btn">
        <SunButton
          loading={blog.loading && blog.items.length > 0}
          disabled={!blog.hasMore}
          onClick={() => void blog.loadMore()}
        >
          {blog.hasMore ? '加载更多' : '没有更多了'}
        </SunButton>
      </div>
      {showTop ? (
        <button
          className="back-to-top"
          aria-label="回到顶部"
          onClick={() =>
            document
              .querySelector<HTMLElement>('.app-container')
              ?.scrollTo({ top: 0, behavior: 'smooth' })
          }
        >
          <SunIcon name="chevron-right" />
        </button>
      ) : null}
    </main>
  )
}
