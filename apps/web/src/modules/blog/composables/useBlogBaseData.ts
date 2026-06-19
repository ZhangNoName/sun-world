import { reactive, ref } from 'vue'
import { fetchBlogCategories, fetchBlogStats, fetchBlogTags } from '../api'
import type {
  CategoryResponse,
  StatsResponse,
  TagResponse,
} from '../types'

const tagList = reactive<TagResponse[]>([])
const categoryList = reactive<CategoryResponse[]>([])
const stats = reactive<StatsResponse>({
  blog_count: 0,
  category_count: 0,
  tag_count: 0,
  total_view_num: 0,
})

const loading = ref(false)
const loaded = ref(false)
let loadingPromise: Promise<void> | null = null

export function useBlogBaseData() {
  const loadBlogBaseData = async (): Promise<void> => {
    if (loaded.value) return
    if (loadingPromise) return loadingPromise

    loading.value = true
    loadingPromise = (async () => {
      const [categories, tags, nextStats] = await Promise.all([
        fetchBlogCategories(),
        fetchBlogTags(),
        fetchBlogStats(),
      ])

      categoryList.splice(0, categoryList.length, ...categories)
      tagList.splice(0, tagList.length, ...tags)
      Object.assign(stats, nextStats)
      loaded.value = true
    })()
      .finally(() => {
        if (!loaded.value) {
          loadingPromise = null
        }
        loading.value = false
      })

    return loadingPromise
  }

  return {
    tagList,
    categoryList,
    stats,
    loading,
    loaded,
    loadBlogBaseData,
  }
}
