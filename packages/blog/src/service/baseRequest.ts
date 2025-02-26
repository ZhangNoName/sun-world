import { request } from './http'

export interface CategoryResponse {
  id: string
  name: string
}

export interface TagResponse {
  id: string
  name: string
}

/**
 * 获取博客分类列表
 * @returns {Promise<CategoryResponse[]>}
 */
export const getBlogCategories = async (): Promise<CategoryResponse[]> => {
  const response = await request.get<CategoryResponse[]>('/base/blog/category')
  return response
}

/**
 * 获取博客标签列表
 * @returns {Promise<TagResponse[]>}
 */
export const getBlogTags = async (): Promise<TagResponse[]> => {
  const response = await request.get<TagResponse[]>('/base/blog/tag')
  return response
}
