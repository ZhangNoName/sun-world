import { getBlogByPage } from '@/service/request'
import type { BlogListResponse } from './types'

export async function fetchBlogPage(
  page: number,
  pageSize: number
): Promise<BlogListResponse> {
  return getBlogByPage(page, pageSize) as Promise<BlogListResponse>
}
