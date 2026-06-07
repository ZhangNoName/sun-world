import { fetchBlogCategories, fetchBlogTags } from '@/modules/blog/api'
/**
 * 获取基础数据
 */
export const fetchBaseData = async () => {
  const [categories, tags] = await Promise.all([
    fetchBlogCategories(),
    fetchBlogTags(),
  ])
  return { categories, tags }
}
