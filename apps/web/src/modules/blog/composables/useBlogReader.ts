import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  type ComputedRef,
  type Ref,
} from 'vue'
import { fetchBlogById } from '../api'
import type { BlogDetail, MarkdownHeadingItem } from '../types'
import { formatDate } from '@/util/function'
import { canonicalUrl } from '@/shared/seo'

export interface BlogReaderViewModel {
  blogPreview: Ref<HTMLElement | null>
  catalog: Ref<MarkdownHeadingItem[]>
  activeHeadingId: Ref<string>
  loading: Ref<boolean>
  blogInfo: Ref<BlogDetail>
  canonicalPath: ComputedRef<string>
  articleCanonical: ComputedRef<string>
  articleDescription: ComputedRef<string>
  publishedAt: ComputedRef<string>
  commentCount: ComputedRef<number>
  wordCount: ComputedRef<number>
  getCatalog: () => MarkdownHeadingItem[]
  handlePreviewCatalog: (headings: MarkdownHeadingItem[]) => void
  handlePreviewRendered: () => Promise<void>
  renderPreview: (content: string) => Promise<void>
  scrollToHeading: (headingId: string) => void
  loadBlog: () => Promise<void>
}

const defaultBlogInfo: BlogDetail = {
  author: '',
  abstract: '',
  byte_num: 0,
  category: null,
  comment_num: 0,
  content: '',
  created_at: '',
  id: 0,
  tag: [],
  title: '',
  updated_at: '',
  view_num: 0,
}

export function useBlogReader(id: Ref<string>): BlogReaderViewModel {
  const blogPreview = ref<HTMLElement | null>(null)
  const catalog = ref<MarkdownHeadingItem[]>([])
  const activeHeadingId = ref('')
  const loading = ref(false)
  const blogInfo = ref<BlogDetail>({ ...defaultBlogInfo })
  let cleanupHeadingTracker: (() => void) | null = null

  const canonicalPath = computed(() =>
    id.value ? `/blog/${encodeURIComponent(id.value)}` : '/blog'
  )
  const articleCanonical = computed(() => canonicalUrl(canonicalPath.value))
  const articleDescription = computed(
    () =>
      blogInfo.value.abstract ||
      blogInfo.value.title ||
      '浏览 Sun World 的技术博客文章。'
  )
  const publishedAt = computed(() =>
    blogInfo.value.created_at ? formatDate(blogInfo.value.created_at) : '-'
  )
  const commentCount = computed(() => blogInfo.value.comment_num ?? 0)
  const wordCount = computed(() =>
    Number(blogInfo.value.byte_num ?? blogInfo.value.content.length)
  )

  onBeforeUnmount(() => {
    cleanupHeadingTracker?.()
  })

  function getCatalog(): MarkdownHeadingItem[] {
    if (!blogPreview.value) return []

    const headers = Array.from(
      blogPreview.value.querySelectorAll('h1, h2, h3, h4, h5, h6')
    )

    return headers
      .filter((header) => header.id)
      .map((header) => ({
        text: header.textContent || '',
        level: Number(header.tagName.charAt(1)),
        id: header.id,
      }))
  }

  function getScrollRoot(): HTMLElement | Window {
    if (typeof document === 'undefined') return window
    return document.querySelector<HTMLElement>('.app-container') ?? window
  }

  function getScrollRootRect(scrollRoot: HTMLElement | Window) {
    if (scrollRoot instanceof HTMLElement) {
      return scrollRoot.getBoundingClientRect()
    }

    return { top: 0 }
  }

  function updateActiveHeading() {
    if (!blogPreview.value) return

    const headings = Array.from(
      blogPreview.value.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')
    ).filter((heading) => heading.id)

    if (!headings.length) {
      activeHeadingId.value = ''
      return
    }

    const scrollRoot = getScrollRoot()
    const rootRect = getScrollRootRect(scrollRoot)
    const activationTop = rootRect.top + 96
    const activeHeading =
      headings
        .filter(
          (heading) => heading.getBoundingClientRect().top <= activationTop
        )
        .at(-1) ?? headings[0]

    activeHeadingId.value = activeHeading.id
  }

  function setupHeadingTracker() {
    cleanupHeadingTracker?.()
    cleanupHeadingTracker = null

    if (!blogPreview.value) return

    const scrollRoot = getScrollRoot()
    let frame = 0
    const handleScroll = () => {
      if (frame) return

      frame = requestAnimationFrame(() => {
        frame = 0
        updateActiveHeading()
      })
    }

    scrollRoot.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll, { passive: true })
    updateActiveHeading()

    cleanupHeadingTracker = () => {
      if (frame) cancelAnimationFrame(frame)
      scrollRoot.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }

  function scrollToHeading(headingId: string) {
    if (!blogPreview.value || !headingId) return

    const target = blogPreview.value.querySelector<HTMLElement>(
      `#${CSS.escape(headingId)}`
    )
    if (!target) return

    const scrollRoot = getScrollRoot()
    const targetTop = target.getBoundingClientRect().top
    const offset = 88

    if (scrollRoot instanceof HTMLElement) {
      const rootTop = scrollRoot.getBoundingClientRect().top
      scrollRoot.scrollTo({
        top: scrollRoot.scrollTop + targetTop - rootTop - offset,
        behavior: 'smooth',
      })
    } else {
      window.scrollTo({
        top: window.scrollY + targetTop - offset,
        behavior: 'smooth',
      })
    }

    activeHeadingId.value = headingId
  }

  function handlePreviewCatalog(headings: MarkdownHeadingItem[]) {
    catalog.value = headings
  }

  async function handlePreviewRendered() {
    await nextTick()
    if (!blogPreview.value) return

    if (!catalog.value.length) {
      catalog.value = getCatalog()
    }

    await nextTick()
    setupHeadingTracker()
  }

  async function renderPreview(_content: string) {
    await handlePreviewRendered()
  }

  async function loadBlog() {
    if (!id.value) {
      throw new Error('UNSPECIFIED_BLOG_ID')
    }

    loading.value = true
    try {
      const detail = await fetchBlogById(id.value)
      blogInfo.value = detail
    } finally {
      loading.value = false
    }

    await renderPreview(blogInfo.value.content)
  }

  return {
    blogPreview,
    catalog,
    activeHeadingId,
    loading,
    blogInfo,
    canonicalPath,
    articleCanonical,
    articleDescription,
    publishedAt,
    commentCount,
    wordCount,
    getCatalog,
    handlePreviewCatalog,
    handlePreviewRendered,
    renderPreview,
    scrollToHeading,
    loadBlog,
  }
}
