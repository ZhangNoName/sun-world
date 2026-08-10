import { SwInput } from '@sun-world/ui/sw-input'
import { useEffect, useRef, useState } from 'react'
import { SunIcon } from '@sun-world/icons/react'
import { SwButton as Button } from '@sun-world/ui/sw-button'
import { LoadingSkeleton } from '@sun-world/ui/loading-skeleton'
import { toast } from '@sun-world/ui/toast'

import { useViewportWidth } from '@/shared/browser/viewport'
import { useBlogBaseData } from '../composables/useBlogBaseData'
import { useBlogList } from '../composables/useBlogList'
import type { BlogSortBy, BlogSortOrder } from '../types'
import { BlogCard } from './BlogCard'
import { BlogWaterfall } from './BlogWaterfall'
import '../styles/blog-experience.css'

const SORT_OPTIONS = [
  { value: 'updated_at:desc', label: '最新优先' },
  { value: 'view_num:desc', label: '浏览量最高' },
  { value: 'updated_at:asc', label: '最早优先' },
]

export function BlogHomeFeed() {
  const { tagList, categoryList, loaded, loadBlogBaseData } = useBlogBaseData()
  const blog = useBlogList(tagList, categoryList, 12)
  const [keyword, setKeyword] = useState('')
  const [sort, setSort] = useState('updated_at:desc')
  const [searchOpen, setSearchOpen] = useState(false)
  const [mode, setMode] = useState<'list' | 'waterfall'>('list')
  const width = useViewportWidth()
  const loaderRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadBlogBaseData().catch(() => toast.error('获取博客基础数据失败'))
  }, [loadBlogBaseData])
  useEffect(() => {
    if (loaded)
      void blog.loadFirstPage().catch(() => toast.error('获取博客列表失败'))
  }, [loaded])

  useEffect(() => {
    if (width <= 695) setMode('list')
  }, [width])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

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

  const advanceSort = () => {
    const currentIndex = SORT_OPTIONS.findIndex(
      (option) => option.value === sort
    )
    const next = SORT_OPTIONS[(currentIndex + 1) % SORT_OPTIONS.length]
    const [sortBy, sortOrder] = next.value.split(':') as [
      BlogSortBy,
      BlogSortOrder,
    ]
    setSort(next.value)
    void blog
      .updateQuery({ keyword, sortBy, sortOrder })
      .catch(() => toast.error('排序失败'))
  }

  const nextSort =
    SORT_OPTIONS[
      (SORT_OPTIONS.findIndex((option) => option.value === sort) + 1) %
        SORT_OPTIONS.length
    ]
  const nextMode = mode === 'list' ? 'waterfall' : 'list'

  const tags = Array.from(new Set(tagList.map((tag) => tag.name))).slice(0, 12)
  return (
    <main className="blog-feed">
      <section className="summary-card" aria-label="文章标签">
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </section>
      <section className="query-panel blog-toolbar" aria-label="博客筛选">
        <div
          className="blog-toolbar__actions"
          role="group"
          aria-label="文章工具"
        >
          <div
            className={`blog-toolbar__search${
              searchOpen ? ' blog-toolbar__search--open' : ''
            }`}
          >
            <SwInput
              ref={searchInputRef}
              label="搜索博客"
              hideVisibleLabel
              value={keyword}
              tabIndex={searchOpen ? undefined : -1}
              aria-hidden={!searchOpen}
              onValueChange={setKeyword}
              onKeyDown={(event) => {
                if (event.key === 'Enter') apply()
                if (event.key === 'Escape') setSearchOpen(false)
              }}
              type="search"
              placeholder="搜索标题或摘要"
            />
          </div>
          <Button
            className="blog-toolbar__action"
            type="button"
            size="icon"
            variant="outline"
            aria-label={searchOpen ? '关闭搜索' : '打开搜索'}
            title={searchOpen ? '关闭搜索' : '打开搜索'}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <SunIcon name="search" />
          </Button>
          <Button
            className="blog-toolbar__action"
            type="button"
            size="icon"
            variant="outline"
            aria-label={`切换为${nextSort.label}排序`}
            title={`切换为${nextSort.label}排序`}
            onClick={advanceSort}
          >
            <SunIcon name="arrow-up-down" />
          </Button>
          <Button
            className="blog-toolbar__action"
            type="button"
            size="icon"
            variant="outline"
            aria-label={`切换为${nextMode === 'list' ? '列表' : '瀑布流'}布局`}
            title={`切换为${nextMode === 'list' ? '列表' : '瀑布流'}布局`}
            disabled={width <= 695}
            onClick={() => setMode(nextMode)}
          >
            <SunIcon name={nextMode === 'list' ? 'list' : 'columns'} />
          </Button>
        </div>
      </section>
      {blog.loading && blog.items.length === 0 ? (
        <LoadingSkeleton lines={4} />
      ) : null}
      {!blog.loading && blog.items.length === 0 ? (
        <p className="empty-state">暂时没有文章</p>
      ) : null}
      {mode === 'waterfall' ? (
        <BlogWaterfall list={blog.items} columnCount={width <= 1024 ? 2 : 3} />
      ) : (
        <section className="blog-list">
          {blog.items.map((item) => (
            <BlogCard key={item.id} {...item} />
          ))}
        </section>
      )}
      <div ref={loaderRef} className="loader-btn">
        <Button
          loading={blog.loading && blog.items.length > 0}
          disabled={!blog.hasMore}
          onClick={() => void blog.loadMore()}
        >
          {blog.hasMore ? '加载更多' : '没有更多了'}
        </Button>
      </div>
    </main>
  )
}
