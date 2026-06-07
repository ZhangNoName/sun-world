import type { Ref } from 'vue'
import type { BlogCardProps } from '@/type'
import type {
  ApiRequestBody,
  ApiSuccessData,
  components,
} from '@sun-world/contracts'

export type BlogCreateContract = ApiRequestBody<'/blogs/', 'post'>

/** Shape returned by GET /blogs (paginated list endpoint). */
export type BlogListResponse =
  ApiSuccessData<'/blogs/', 'get'> extends never
    ? components['schemas']['BlogPage']
    : NonNullable<ApiSuccessData<'/blogs/', 'get'>>

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
  ApiSuccessData<'/blogs/{blog_id}', 'get'> extends never
    ? components['schemas']['BlogDetail']
    : NonNullable<ApiSuccessData<'/blogs/{blog_id}', 'get'>>

// ---- Create blog payload ----

/** Payload shape for creating or updating a blog post. */
export type CreateBlogPayload = Omit<BlogCreateContract, 'category' | 'tag'> & {
  category?: string | number
  tag?: (string | number | { name: string })[]
  author?: string | null
}

/** Successful blog creation response. */
export type CreateBlogResponse =
  ApiSuccessData<'/blogs/', 'post'> extends never
    ? components['schemas']['BlogCreateResult']
    : NonNullable<ApiSuccessData<'/blogs/', 'post'>>

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
