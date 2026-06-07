import { request } from './http'
import type { components, operations } from '@sun-world/contracts'

type StatsOperation =
  operations['base_info_base__get']['responses'][200]['content']['application/json']
type CategoryOperation =
  operations['get_blog_category_base_blog_category_get']['responses'][200]['content']['application/json']
type TagOperation =
  operations['get_tag_list_base_blog_tag_get']['responses'][200]['content']['application/json']

type ApiEnvelope<T> = {
  code: number | string
  data: T | null
  msg: string
}

export type CategoryResponse = components['schemas']['Category']
export type TagResponse = components['schemas']['TagBase']

export type StatsResponse =
  StatsOperation extends ApiEnvelope<infer T>
    ? NonNullable<T>
    : components['schemas']['BlogStats']

export type CategoryListResponse =
  CategoryOperation extends ApiEnvelope<infer T>
    ? NonNullable<T>
    : CategoryResponse[]

export type TagListResponse =
  TagOperation extends ApiEnvelope<infer T>
    ? NonNullable<T>
    : TagResponse[]
/**
 * 获取基本数据
 * @returns {Promise<StatsResponse[]>}
 */
export const getStats = async (): Promise<StatsResponse> => {
  const response = await request.get<StatsResponse>('/base/')
  return response
}
/**
 * 获取博客分类列表
 * @returns {Promise<CategoryResponse[]>}
 */
export const getBlogCategories = async (): Promise<CategoryListResponse> => {
  const response = await request.get<CategoryListResponse>('/base/blog/category')
  return response
}

/**
 * 获取博客标签列表
 * @returns {Promise<TagResponse[]>}
 */
export const getBlogTags = async (): Promise<TagListResponse> => {
  const response = await request.get<TagListResponse>('/base/blog/tag')
  return response
}
