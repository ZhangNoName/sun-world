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
