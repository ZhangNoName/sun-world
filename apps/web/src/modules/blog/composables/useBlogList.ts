import { useCallback, useRef, useState } from 'react'

import { formatDate } from '@/util/function'
import { fetchBlogPage } from '../api'
import type {
  BlogListItem,
  BlogListQuery,
  BlogListViewModel,
  BlogRawItem,
  BlogSortBy,
  BlogSortOrder,
  CategoryResponse,
  TagResponse,
} from '../types'

export function useBlogList(
  tagList: TagResponse[],
  categoryList: CategoryResponse[],
  pageSize = 5
): BlogListViewModel {
  const [items, setItems] = useState<BlogListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [sortBy, setSortBy] = useState<BlogSortBy>('updated_at')
  const [sortOrder, setSortOrder] = useState<BlogSortOrder>('desc')
  const state = useRef({ page: 1, loading: false, hasMore: true })

  const mapItem = useCallback(
    (item: BlogRawItem): BlogListItem => {
      const labels = (item.tag ?? [])
        .map((id) => tagList.find((tag) => String(tag.id) === String(id))?.name)
        .filter((name): name is string => Boolean(name))
        .map((name) =>
          /^frontend-basic-\d{2}$/.test(name)
            ? '前端基础'
            : /^algorithm-basic-\d{2}$/.test(name)
              ? '算法基础'
              : name
        )
      return {
        id: String(item.id ?? ''),
        title: item.title,
        abstract: item.abstract,
        publishTime: item.created_at ? formatDate(item.created_at) : '-',
        lastUpdateTime: item.updated_at ? formatDate(item.updated_at) : '-',
        tags: Array.from(new Set(labels)),
        category:
          categoryList.find(
            (category) => String(category.id) === String(item.category)
          )?.name ?? '未分类',
        byteNum: item.byte_num,
        commentNum: item.comment_num,
        viewNum: item.view_num,
      }
    },
    [categoryList, tagList]
  )

  const requestPage = useCallback(
    async (
      page: number,
      nextQuery: {
        keyword: string
        sortBy: BlogSortBy
        sortOrder: BlogSortOrder
      },
      append: boolean
    ) => {
      if (state.current.loading) return
      state.current.loading = true
      setLoading(true)
      try {
        const response = await fetchBlogPage(page, pageSize, nextQuery)
        const mapped = (response.list ?? []).map(mapItem)
        setItems((current) => {
          const next = append ? [...current, ...mapped] : mapped
          const more = next.length < response.total
          state.current.hasMore = more
          setHasMore(more)
          return next
        })
        state.current.page = page
        setTotal(response.total)
      } finally {
        state.current.loading = false
        setLoading(false)
      }
    },
    [mapItem, pageSize]
  )

  const loadFirstPage = useCallback(
    () => requestPage(1, { keyword, sortBy, sortOrder }, false),
    [keyword, requestPage, sortBy, sortOrder]
  )

  const loadMore = useCallback(() => {
    if (!state.current.hasMore || state.current.loading)
      return Promise.resolve()
    return requestPage(
      state.current.page + 1,
      { keyword, sortBy, sortOrder },
      true
    )
  }, [keyword, requestPage, sortBy, sortOrder])

  const updateQuery = useCallback(
    (query: BlogListQuery) => {
      const next = {
        keyword: query.keyword ?? keyword,
        sortBy: query.sortBy ?? sortBy,
        sortOrder: query.sortOrder ?? sortOrder,
      }
      setKeyword(next.keyword)
      setSortBy(next.sortBy)
      setSortOrder(next.sortOrder)
      state.current.hasMore = true
      return requestPage(1, next, false)
    },
    [keyword, requestPage, sortBy, sortOrder]
  )

  return {
    items,
    loading,
    total,
    hasMore,
    keyword,
    sortBy,
    sortOrder,
    loadFirstPage,
    loadMore,
    updateQuery,
  }
}
