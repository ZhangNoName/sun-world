import { getBlogCategories, getBlogTags } from '@/service/baseRequest'
/**
 * 获取基础数据
 */
export const fetchBaseData = async () => {
  const [categories, tags] = await Promise.all([
    getBlogCategories(),
    getBlogTags(),
  ])
  return { categories, tags }
}
