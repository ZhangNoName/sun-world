import { apiGet, apiPost } from '@/shared/api'
import type {
  BlogCategoryList,
  BlogCreateContract,
  BlogDetail,
  BlogListResponse,
  BlogStats,
  BlogTagList,
  CreateBlogPayload,
  CreateBlogResponse,
} from './types'

/**
 * Fetch a paginated blog list from the API.
 *
 * Delegates to the legacy `getBlogByPage` service for now and
 * casts the response to the typed `BlogListResponse`.
 */
export async function fetchBlogPage(
  page: number,
  pageSize: number
): Promise<BlogListResponse> {
  return apiGet('/blogs/', { query: { page, pageSize } })
}

export async function fetchBlogById(
  id: string
): Promise<BlogDetail> {
  return apiGet('/blogs/{blog_id}', { path: { blog_id: Number(id) } })
}

export function fetchBlogStats(): Promise<BlogStats> {
  return apiGet('/base/')
}

export function fetchBlogCategories(): Promise<BlogCategoryList> {
  return apiGet('/base/blog/category')
}

export function fetchBlogTags(): Promise<BlogTagList> {
  return apiGet('/base/blog/tag')
}

export async function createBlog(
  params: CreateBlogPayload
): Promise<CreateBlogResponse> {
  const payload = {
    ...params,
    author: params.author ?? undefined,
    category:
      params.category === undefined || params.category === null
        ? undefined
        : Number(params.category),
    tag: params.tag?.map(normalizeTagInput),
  } as BlogCreateContract

  return apiPost('/blogs/', payload)
}

function normalizeTagInput(
  item: NonNullable<CreateBlogPayload['tag']>[number]
): NonNullable<BlogCreateContract['tag']>[number] {
  if (typeof item === 'number') {
    return item
  }

  if (typeof item === 'string') {
    const numericId = Number(item)
    return Number.isFinite(numericId) ? numericId : { name: item }
  }

  return item
}
