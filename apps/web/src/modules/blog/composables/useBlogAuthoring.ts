import { useCallback, useEffect, useState } from 'react'
import { toast } from '@sun-world/ui/toast'

import { createBlog } from '../api'
import { getBlogErrorMessage } from '../errors'
import { useBlogBaseData } from './useBlogBaseData'

export function useBlogAuthoring() {
  const { categoryList, tagList, loadBlogBaseData } = useBlogBaseData()
  const [blogContent, setBlogContent] = useState('')
  const [blogCategory, setBlogCategory] = useState<string | number>('')
  const [blogTag, setBlogTag] = useState<Array<string | number>>([])
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    void loadBlogBaseData().catch(() => toast.error('获取文章基础数据失败'))
  }, [loadBlogBaseData])

  const saveBlog = useCallback(async () => {
    if (saving) return false
    if (!title.trim()) {
      toast.error('标题不能为空')
      return false
    }
    setSaving(true)
    try {
      await createBlog({
        title: title.trim(),
        content: blogContent,
        abstract: blogContent.slice(0, 100),
        author: 'test',
        category: blogCategory,
        tag: blogTag.map((id) =>
          tagList.some((tag) => String(tag.id) === String(id))
            ? id
            : { name: String(id) }
        ),
      })
      toast.success('保存成功')
      return true
    } catch (error) {
      toast.error(getBlogErrorMessage(error))
      return false
    } finally {
      setSaving(false)
    }
  }, [blogCategory, blogContent, blogTag, saving, tagList, title])

  return {
    blogContent,
    setBlogContent,
    blogWordCount: blogContent.length,
    blogCategory,
    setBlogCategory,
    blogTag,
    setBlogTag,
    title,
    setTitle,
    saving,
    categoryList,
    tagList,
    saveBlog,
  }
}
