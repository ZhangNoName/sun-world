import type { Ref } from 'vue'
import type { BlogCardProps } from '@/type'

// ---- Raw API response shapes ----

/** Shape returned by GET /blogs (paginated list endpoint). */
export interface BlogListResponse {
  list: BlogRawItem[]
  page: number
  page_size: number
  total: number
}

/** Raw blog item from the API before mapping. */
export interface BlogRawItem {
  title: string
  abstract: string
  created_at: string
  updated_at: string
  id: number | string
  comment_num: number
  byte_num: number
  view_num: number
  tag: (number | string)[]
  category: number | string
  author?: string
  cover_url?: string
}

// ---- Blog detail ----

/**
 * Typed blog detail shape (correct spelling).
 *
 * Replaces the legacy `BlogDeatil` typo in `@/service/request` for new code.
 * Both interfaces are compatible at runtime; migrate callers gradually.
 */
export interface BlogDetail {
  author: string
  content: string
  created_at: string
  id: string
  title: string
  update_at: string
  updated_at?: string
  comment_num?: number
  byte_num?: number
  view_num?: number
}

// ---- Create blog payload ----

/** Payload shape for creating or updating a blog post. */
export interface CreateBlogPayload {
  title: string
  content: string
  abstract: string
  author?: string
  category?: string
  tag?: (string | { name: string })[]
}

/** Successful blog creation response. */
export interface CreateBlogResponse {
  id: number | string
}

// ---- View models ----

/** Mapped view model consumed by BlogCard and list templates. */
export type BlogListItem = BlogCardProps

/** Result shape returned by useBlogList. */
export interface BlogListViewModel {
  /** Mapped items for rendering. */
  items: Ref<BlogListItem[]>
  /** Whether data is being loaded. */
  loading: Ref<boolean>
  /** Whether more pages can be loaded. */
  hasMore: Ref<boolean>
  /** Total number of items across all pages. */
  total: Ref<number>
  /** Load the first page (replaces current items). */
  loadFirstPage: () => Promise<void>
  /** Append the next page (infinite scroll / load-more). */
  loadMore: () => Promise<void>
}
