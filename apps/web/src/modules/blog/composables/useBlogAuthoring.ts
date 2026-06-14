import { ref, shallowRef, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import { BlogEditorClass } from '@/blogEditor'
import { createBlog } from '../api'
import { useBlogBaseData } from './useBlogBaseData'
import { getBlogErrorMessage } from '../errors'
import type { CategoryResponse, CreateBlogPayload, TagResponse } from '../types'

export interface BlogAuthoringViewModel {
  editorEle: Ref<HTMLElement | null>
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

  const editorEle = ref<HTMLElement | null>(null)
  const blogWordCount = ref(0)
  const blogEditor = shallowRef<BlogEditorClass>(new BlogEditorClass())
  const blogCategory = ref<string | number>('')
  const blogTag = ref<Array<string | number>>([])
  const title = ref('')
  const saving = ref(false)

  const initializeAuthoring = () => {
    loadBlogBaseData().catch((error) => {
      console.error('获取博客基础数据失败:', error)
    })

    if (!editorEle.value) return

    blogEditor.value.init(editorEle.value)
    ;(window as unknown as { blogEditor?: BlogEditorClass }).blogEditor =
      blogEditor.value

    blogEditor.value.setConfig({
      input: (value) => {
        blogWordCount.value = value.length
      },
    })
  }

  const saveBlog = async () => {
    if (saving.value) return
    if (title.value.trim() === '') {
      ElMessage.error('标题不能为空')
      return
    }

    const content = blogEditor.value.getContent() || ''
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
    editorEle,
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
