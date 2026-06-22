import { computed, nextTick, ref, type ComputedRef, type Ref } from 'vue'
import { fetchBlogById } from '../api'
import type { BlogDetail, VditorTreeItemType } from '../types'
import { formatDate } from '@/util/function'
import { canonicalUrl } from '@/shared/seo'
// @ts-ignore
import VditorPreview from 'vditor/dist/method.min'

export interface BlogReaderViewModel {
  blogPreview: Ref<HTMLElement | null>
  catalog: Ref<VditorTreeItemType[]>
  loading: Ref<boolean>
  blogInfo: Ref<BlogDetail>
  canonicalPath: ComputedRef<string>
  articleCanonical: ComputedRef<string>
  articleDescription: ComputedRef<string>
  publishedAt: ComputedRef<string>
  commentCount: ComputedRef<number>
  wordCount: ComputedRef<number>
  getCatalog: () => VditorTreeItemType[]
  renderPreview: (content: string) => Promise<void>
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
  const catalog = ref<VditorTreeItemType[]>([])
  const loading = ref(false)
  const blogInfo = ref<BlogDetail>({ ...defaultBlogInfo })

  const canonicalPath = computed(() =>
    id.value ? `/blog?id=${encodeURIComponent(id.value)}` : '/blog'
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

  function getCatalog(): VditorTreeItemType[] {
    if (!blogPreview.value) return []

    const headers = blogPreview.value.querySelectorAll('h1, h2, h3, h4, h5, h6')
    return Array.from(headers).map((header) => ({
      text: header.textContent || '',
      level: Number(header.tagName.charAt(1)),
      id: header.id,
    }))
  }

  async function renderPreview(content: string) {
    await nextTick()
    if (!blogPreview.value) return

    await VditorPreview.preview(blogPreview.value, content, {
      theme: {
        current: 'light',
      },
      hljs: {
        style: 'github',
      },
    })
    catalog.value = getCatalog()
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
    loading,
    blogInfo,
    canonicalPath,
    articleCanonical,
    articleDescription,
    publishedAt,
    commentCount,
    wordCount,
    getCatalog,
    renderPreview,
    loadBlog,
  }
}
