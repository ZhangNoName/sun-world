import { ref, reactive, type Ref } from 'vue'
import { formatDate } from '@/util/function'
import { fetchBlogPage } from '../api'
import type {
  BlogListQuery,
  BlogListItem,
  BlogListViewModel,
  BlogRawItem,
  BlogSortBy,
  BlogSortOrder,
  CategoryResponse,
  TagResponse,
} from '../types'

/**
 * Typed blog list composable.
 *
 * Replaces the inline `any[]` blog-list logic in `modules/home/pages/HomePage.vue`
 * with a reusable, testable data boundary. Consumes the existing
 * `getBlogByPage` endpoint and maps raw items to the `BlogListItem`
 * view model using injected tag / category lookups.
 *
 * Usage:
 *   const blogList = useBlogList(tagList, categoryList)
 *   onMounted(() => blogList.loadFirstPage())
 */
export function useBlogList(
  tagList: TagResponse[] | Ref<TagResponse[]>,
  categoryList: CategoryResponse[] | Ref<CategoryResponse[]>,
  pageSize = 5
): BlogListViewModel {
  const items = ref<BlogListItem[]>([])
  const loading = ref(false)
  const total = ref(0)
  const hasMore = ref(true)
  const keyword = ref('')
  const sortBy = ref<BlogSortBy>('updated_at')
  const sortOrder = ref<BlogSortOrder>('desc')

  const page = reactive({ page: 1, pageSize })

  /** Resolve a reactive or plain array to a plain array. */
  const resolve = <T>(source: T[] | Ref<T[]>): T[] =>
    Array.isArray(source) ? source : source.value

  const normalizeTagLabel = (name: string): string => {
    if (/^frontend-basic-\d{2}$/.test(name)) return '前端基础'
    if (/^algorithm-basic-\d{2}$/.test(name)) return '算法基础'
    return name
  }

  const uniqueLabels = (labels: string[]): string[] =>
    Array.from(new Set(labels.filter(Boolean)))

  /** Map a raw API item to the BlogListItem view model. */
  const mapItem = (o: BlogRawItem): BlogListItem => {
    const resolvedTags: TagResponse[] = resolve(tagList)
    const resolvedCategories: CategoryResponse[] = resolve(categoryList)

    return {
      title: o.title,
      abstract: o.abstract,
      lastUpdateTime: o.updated_at ? formatDate(o.updated_at) : '-',
      id: String(o.id ?? ''),
      commentNum: o.comment_num,
      byteNum: o.byte_num,
      tags: uniqueLabels(
        (o.tag ?? [])
          .map(
            (tagId: number | string) =>
              resolvedTags.find((t) => String(t.id) === String(tagId))?.name
          )
          .filter(Boolean)
          .map((name) => normalizeTagLabel(String(name)))
      ),
      category:
        resolvedCategories.find((c) => String(c.id) === String(o.category))
          ?.name || '未分类',
      viewNum: o.view_num,
      publishTime: o.created_at ? formatDate(o.created_at) : '-',
    }
  }

  const loadFirstPage = async () => {
    loading.value = true
    page.page = 1
    try {
      const res = await fetchBlogPage(page.page, page.pageSize, {
        keyword: keyword.value,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
      })
      const mapped = (res.list ?? []).map(mapItem)
      items.value = mapped
      total.value = res.total
      hasMore.value = items.value.length < res.total
    } finally {
      loading.value = false
    }
  }

  const loadMore = async () => {
    if (loading.value || !hasMore.value) return
    loading.value = true
    page.page++
    try {
      const res = await fetchBlogPage(page.page, page.pageSize, {
        keyword: keyword.value,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
      })
      const mapped = (res.list ?? []).map(mapItem)
      items.value = [...items.value, ...mapped]
      total.value = res.total
      hasMore.value = items.value.length < res.total
    } finally {
      loading.value = false
    }
  }

  const updateQuery = async (query: BlogListQuery) => {
    if (query.keyword !== undefined) keyword.value = query.keyword
    if (query.sortBy !== undefined) sortBy.value = query.sortBy
    if (query.sortOrder !== undefined) sortOrder.value = query.sortOrder
    await loadFirstPage()
  }

  return {
    items,
    loading,
    hasMore,
    total,
    keyword,
    sortBy,
    sortOrder,
    loadFirstPage,
    loadMore,
    updateQuery,
  }
}
