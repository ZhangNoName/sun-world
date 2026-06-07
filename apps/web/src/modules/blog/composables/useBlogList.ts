import { ref, reactive, type Ref } from 'vue'
import type { CategoryResponse, TagResponse } from '@/service/baseRequest'
import { formatDate } from '@/util/function'
import { fetchBlogPage } from '../api'
import type { BlogListItem, BlogListViewModel, BlogRawItem } from '../types'

/**
 * Typed blog list composable.
 *
 * Replaces the inline `any[]` blog-list logic in `pages/home/index.vue`
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

  const page = reactive({ page: 1, pageSize })

  /** Resolve a reactive or plain array to a plain array. */
  const resolve = <T>(source: T[] | Ref<T[]>): T[] =>
    Array.isArray(source) ? source : source.value

  /** Map a raw API item to the BlogListItem view model. */
  const mapItem = (o: BlogRawItem): BlogListItem => {
    const resolvedTags = resolve(tagList)
    const resolvedCategories = resolve(categoryList)

    return {
      title: o.title,
      abstract: o.abstract,
      lastUpdateTime: formatDate(o.updated_at),
      id: o.id.toString(),
      commentNum: o.comment_num,
      byteNum: o.byte_num,
      tags: (o.tag ?? [])
        .map((tagId: number | string) =>
          resolvedTags.find((t) => String(t.id) === String(tagId))?.name
        )
        .filter(Boolean) as string[],
      category:
        resolvedCategories.find((c) => String(c.id) === String(o.category))
          ?.name || '未分类',
      viewNum: o.view_num,
      publishTime: formatDate(o.created_at),
    }
  }

  const loadFirstPage = async () => {
    loading.value = true
    page.page = 1
    try {
      const res = await fetchBlogPage(page.page, page.pageSize)
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
      const res = await fetchBlogPage(page.page, page.pageSize)
      const mapped = (res.list ?? []).map(mapItem)
      items.value = [...items.value, ...mapped]
      total.value = res.total
      hasMore.value = items.value.length < res.total
    } finally {
      loading.value = false
    }
  }

  return {
    items,
    loading,
    hasMore,
    total,
    loadFirstPage,
    loadMore,
  }
}
