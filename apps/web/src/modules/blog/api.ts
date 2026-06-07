import { apiGet, apiPost } from '@/shared/api'
import type {
  BlogCreateContract,
  BlogDetail,
  BlogListResponse,
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

/**
 * Fetch a single blog post by ID.
 *
 * The legacy `getBlogById` returns the `BlogDeatil` shape which is
 * compatible with the typed `BlogDetail` at runtime.
 */
export async function fetchBlogById(
  id: string
): Promise<BlogDetail> {
  return apiGet('/blogs/{blog_id}', { path: { blog_id: Number(id) } })
}

/**
 * Create a new blog post.
 *
 * Delegates to `postSaveBlog` under the hood. Returns the new blog ID.
 */
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
