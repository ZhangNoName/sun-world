import { ref, type Ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createBlog } from '../api'
import { useBlogBaseData } from './useBlogBaseData'
import { getBlogErrorMessage } from '../errors'
import type { CategoryResponse, CreateBlogPayload, TagResponse } from '../types'

export interface BlogAuthoringViewModel {
  blogContent: Ref<string>
  blogWordCount: Ref<number>
  blogCategory: Ref<string | number>
  blogTag: Ref<Array<string | number>>
  title: Ref<string>
  saving: Ref<boolean>
  categoryList: CategoryResponse[]
  tagList: TagResponse[]
  initializeAuthoring: () => void
  saveBlog: () => Promise<void>
}

export function useBlogAuthoring(): BlogAuthoringViewModel {
  const { categoryList, tagList, loadBlogBaseData } = useBlogBaseData()

  const blogContent = ref('')
  const blogWordCount = ref(0)
  const blogCategory = ref<string | number>('')
  const blogTag = ref<Array<string | number>>([])
  const title = ref('')
  const saving = ref(false)

  const initializeAuthoring = () => {
    loadBlogBaseData().catch((error) => {
      console.error('获取文章基础数据失败:', error)
    })
  }

  watch(
    blogContent,
    () => {
      blogWordCount.value = blogContent.value.length
    },
    { immediate: true }
  )

  const saveBlog = async () => {
    if (saving.value) return
    if (title.value.trim() === '') {
      ElMessage.error('标题不能为空')
      return
    }

    const content = blogContent.value || ''
    const tags = blogTag.value.map((tagId) => {
      const item = tagList.find((i) => String(i.id) === String(tagId))
      return item ? tagId : { name: tagId.toString() }
    })

    const params: CreateBlogPayload = {
      title: title.value.trim(),
      content,
      abstract: content.substring(0, 100),
      author: 'test',
      category: blogCategory.value,
      tag: tags,
    }

    saving.value = true
    try {
      await createBlog(params)
      ElMessage.success('保存成功')
    } catch (error) {
      ElMessage.error(getBlogErrorMessage(error))
    } finally {
      saving.value = false
    }
  }

  return {
    blogContent,
    blogWordCount,
    blogCategory,
    blogTag,
    title,
    saving,
    categoryList,
    tagList,
    initializeAuthoring,
    saveBlog,
  }
}
