import { useCallback, useState } from 'react'

import { fetchBlogCategories, fetchBlogStats, fetchBlogTags } from '../api'
import type { CategoryResponse, StatsResponse, TagResponse } from '../types'

const emptyStats: StatsResponse = {
  blog_count: 0,
  category_count: 0,
  tag_count: 0,
  total_view_num: 0,
}

let cache:
  | {
      categories: CategoryResponse[]
      tags: TagResponse[]
      stats: StatsResponse
    }
  | undefined
let pending: Promise<NonNullable<typeof cache>> | undefined

export function useBlogBaseData() {
  const [categoryList, setCategoryList] = useState(cache?.categories ?? [])
  const [tagList, setTagList] = useState(cache?.tags ?? [])
  const [stats, setStats] = useState(cache?.stats ?? emptyStats)
  const [loading, setLoading] = useState(false)

  const loadBlogBaseData = useCallback(async () => {
    setLoading(true)
    try {
      pending ??= Promise.all([
        fetchBlogCategories(),
        fetchBlogTags(),
        fetchBlogStats(),
      ]).then(([categories, tags, nextStats]) => ({
        categories,
        tags,
        stats: nextStats,
      }))
      cache = await pending
      setCategoryList(cache.categories)
      setTagList(cache.tags)
      setStats(cache.stats)
    } catch (error) {
      pending = undefined
      throw error
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    tagList,
    categoryList,
    stats,
    loading,
    loaded: Boolean(cache),
    loadBlogBaseData,
  }
}
