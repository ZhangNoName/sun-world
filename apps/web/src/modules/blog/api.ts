import { getBlogByPage, getBlogById, postSaveBlog } from '@/service/request'
import type {
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
  return getBlogByPage(page, pageSize) as Promise<BlogListResponse>
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
  return getBlogById(id) as Promise<BlogDetail>
}

/**
 * Create a new blog post.
 *
 * Delegates to `postSaveBlog` under the hood. Returns the new blog ID.
 */
export async function createBlog(
  params: CreateBlogPayload
): Promise<CreateBlogResponse> {
  return postSaveBlog(params) as Promise<CreateBlogResponse>
}
