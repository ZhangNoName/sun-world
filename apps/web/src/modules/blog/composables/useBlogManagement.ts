import { useCallback, useEffect, useState } from 'react'
import { fetchBlogCategories, fetchBlogPage, fetchBlogTags } from '../api'
import type {
  BlogCategory,
  BlogRawItem,
  BlogSortBy,
  BlogSortOrder,
  BlogTag,
} from '../types'

const PAGE_SIZE = 10

export function useBlogManagement() {
  const [keyword, setKeyword] = useState('')
  const [activeKeyword, setActiveKeyword] = useState('')
  const [sortBy, setSortBy] = useState<BlogSortBy>('updated_at')
  const [sortOrder, setSortOrder] = useState<BlogSortOrder>('desc')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [items, setItems] = useState<BlogRawItem[]>([])
  const [categories, setCategories] = useState<BlogCategory[]>([])
  const [tags, setTags] = useState<BlogTag[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [validationMessage, setValidationMessage] = useState('')

  const loadPage = useCallback(
    async (nextPage: number, query = activeKeyword) => {
      setLoading(true)
      setErrorMessage('')
      try {
        const response = await fetchBlogPage(nextPage, PAGE_SIZE, {
          keyword: query || undefined,
          sortBy,
          sortOrder,
        })
        setItems(response.list ?? [])
        setPage(response.page ?? nextPage)
        setTotal(response.total ?? 0)
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : '博客列表加载失败'
        )
      } finally {
        setLoading(false)
      }
    },
    [activeKeyword, sortBy, sortOrder]
  )

  useEffect(() => {
    void Promise.all([fetchBlogCategories(), fetchBlogTags()])
      .then(([nextCategories, nextTags]) => {
        setCategories(nextCategories)
        setTags(nextTags)
      })
      .catch(() => undefined)
    void loadPage(1)
  }, [loadPage])

  const submit = useCallback(async () => {
    const query = keyword.trim()
    if (query.length > 30) {
      setValidationMessage('关键词不能超过 30 个字符')
      return
    }
    setValidationMessage('')
    setActiveKeyword(query)
    await loadPage(1, query)
  }, [keyword, loadPage])
  const reset = useCallback(async () => {
    setKeyword('')
    setActiveKeyword('')
    setValidationMessage('')
    await loadPage(1, '')
  }, [loadPage])
  const changePage = useCallback((next: number) => loadPage(next), [loadPage])

  return {
    keyword,
    setKeyword,
    activeKeyword,
    sortBy,
    setSortBy,
    sortOrder,
    setSortOrder,
    page,
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
    refresh: () => loadPage(page),
  }
}
