import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchBlogCategories, fetchBlogPage, fetchBlogTags } from '../api'
import type {
  BlogCategory,
  BlogRawItem,
  BlogSortBy,
  BlogSortOrder,
  BlogTag,
} from '../types'

const PAGE_SIZE = 10

interface BlogQueryState {
  keyword: string
  sortBy: BlogSortBy
  sortOrder: BlogSortOrder
  page: number
  revision: number
}

const initialQuery: BlogQueryState = {
  keyword: '',
  sortBy: 'updated_at',
  sortOrder: 'desc',
  page: 1,
  revision: 0,
}

export function useBlogManagement() {
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState(initialQuery)
  const [total, setTotal] = useState(0)
  const [items, setItems] = useState<BlogRawItem[]>([])
  const [categories, setCategories] = useState<BlogCategory[]>([])
  const [tags, setTags] = useState<BlogTag[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [validationMessage, setValidationMessage] = useState('')
  const requestId = useRef(0)

  useEffect(() => {
    let active = true
    void Promise.all([fetchBlogCategories(), fetchBlogTags()])
      .then(([nextCategories, nextTags]) => {
        if (!active) return
        setCategories(nextCategories)
        setTags(nextTags)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const currentId = ++requestId.current
    setLoading(true)
    setErrorMessage('')
    void fetchBlogPage(query.page, PAGE_SIZE, {
      keyword: query.keyword || undefined,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    })
      .then((response) => {
        if (currentId !== requestId.current) return
        setItems(response.list ?? [])
        setTotal(response.total ?? 0)
      })
      .catch((error: unknown) => {
        if (currentId !== requestId.current) return
        setErrorMessage(
          error instanceof Error ? error.message : '博客列表加载失败'
        )
      })
      .finally(() => {
        if (currentId === requestId.current) setLoading(false)
      })
    return () => {
      requestId.current += 1
    }
  }, [query])

  const submit = useCallback(async () => {
    const nextKeyword = keyword.trim()
    if (nextKeyword.length > 30) {
      setValidationMessage('关键词不能超过 30 个字符')
      return
    }
    setValidationMessage('')
    setQuery((current) => ({
      ...current,
      keyword: nextKeyword,
      page: 1,
      revision: current.revision + 1,
    }))
  }, [keyword])

  const reset = useCallback(async () => {
    setKeyword('')
    setValidationMessage('')
    setQuery((current) => ({
      ...current,
      keyword: '',
      page: 1,
      revision: current.revision + 1,
    }))
  }, [])

  const changePage = useCallback(async (page: number) => {
    setQuery((current) => ({ ...current, page }))
  }, [])

  return {
    keyword,
    setKeyword,
    activeKeyword: query.keyword,
    sortBy: query.sortBy,
    setSortBy: (sortBy: BlogSortBy) =>
      setQuery((current) => ({ ...current, sortBy, page: 1 })),
    sortOrder: query.sortOrder,
    setSortOrder: (sortOrder: BlogSortOrder) =>
      setQuery((current) => ({ ...current, sortOrder, page: 1 })),
    page: query.page,
    pageSize: PAGE_SIZE,
    total,
    items,
    categories,
    tags,
    loading,
    errorMessage,
    validationMessage,
    submit,
    reset,
    changePage,
    refresh: async () =>
      setQuery((current) => ({
        ...current,
        revision: current.revision + 1,
      })),
  }
}
