import type { Ref } from 'vue'
import type { BlogCardProps } from '@/type'
import type { components, operations } from '@sun-world/contracts'

type BlogPageOperation =
  operations['get_blogs_paginated_blogs__get']['responses'][200]['content']['application/json']
type BlogDetailOperation =
  operations['get_blog_blogs__blog_id__get']['responses'][200]['content']['application/json']
type BlogCreateOperation =
  operations['create_blog_blogs__post']['responses'][201]['content']['application/json']
type BlogCreateBody =
  operations['create_blog_blogs__post']['requestBody']['content']['application/json']
export type BlogCreateContract = BlogCreateBody

// ---- Raw API response shapes ----

export type BlogApiEnvelope<T> = {
  code: number | string
  data: T | null
  msg: string
}

/** Shape returned by GET /blogs (paginated list endpoint). */
export type BlogListResponse =
  BlogPageOperation extends BlogApiEnvelope<infer T>
    ? NonNullable<T>
    : components['schemas']['BlogPage']

/** Raw blog item from the API before mapping. */
export type BlogRawItem = components['schemas']['BlogBase'] & {
  created_at?: string
}

// ---- Blog detail ----

/**
 * Typed blog detail shape (correct spelling).
 *
 * Replaces the legacy `BlogDeatil` typo in `@/service/request` for new code.
 * Both interfaces are compatible at runtime; migrate callers gradually.
 */
export type BlogDetail =
  BlogDetailOperation extends BlogApiEnvelope<infer T>
    ? NonNullable<T>
    : components['schemas']['BlogDetail']

// ---- Create blog payload ----

/** Payload shape for creating or updating a blog post. */
export type CreateBlogPayload = Omit<BlogCreateBody, 'category' | 'tag'> & {
  category?: string | number
  tag?: (string | number | { name: string })[]
  author?: string | null
}

/** Successful blog creation response. */
export type CreateBlogResponse =
  BlogCreateOperation extends BlogApiEnvelope<infer T>
    ? NonNullable<T>
    : components['schemas']['BlogCreateResult']

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
