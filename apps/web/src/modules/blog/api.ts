import { API_ROUTES } from '@sun-world/contracts'
import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/api'
import type {
  BlogCategoryList,
  BlogCreateContract,
  BlogDetail,
  BlogListResponse,
  BlogListQuery,
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
  pageSize: number,
  options: BlogListQuery = {}
): Promise<BlogListResponse> {
  const keyword = options.keyword?.trim()
  const query = {
    page,
    pageSize,
    ...(keyword ? { keyword } : {}),
    ...(options.sortBy ? { sortBy: options.sortBy } : {}),
    ...(options.sortOrder ? { sortOrder: options.sortOrder } : {}),
  }

  return apiGet(API_ROUTES.blog.list, { query })
}

export async function fetchBlogById(id: string): Promise<BlogDetail> {
  return apiGet(API_ROUTES.blog.detail, { path: { blog_id: Number(id) } })
}

export function fetchBlogStats(): Promise<BlogStats> {
  return apiGet(API_ROUTES.base.summary)
}

export function fetchBlogCategories(): Promise<BlogCategoryList> {
  return apiGet(API_ROUTES.base.categories)
}

export function fetchBlogTags(): Promise<BlogTagList> {
  return apiGet(API_ROUTES.base.tags)
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

  return apiPost(API_ROUTES.blog.create, payload)
}

export function deleteBlog(id: string | number): Promise<unknown> {
  return apiDelete(API_ROUTES.blog.delete, { path: { blog_id: String(id) } })
}

export function updateBlog(
  id: string | number,
  params: CreateBlogPayload
): Promise<unknown> {
  const payload = {
    ...params,
    id: Number(id),
    author: params.author ?? undefined,
    category:
      params.category === undefined || params.category === null
        ? undefined
        : Number(params.category),
    tag: params.tag?.map(normalizeTagInput),
  } as BlogCreateContract

  return apiPut(API_ROUTES.blog.update, payload, {
    path: { blog_id: Number(id) },
  })
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
