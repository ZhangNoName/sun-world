import { computed, type ComputedRef, ref, type Ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormItem } from '@/components/Form/type'
import type { SunTableColumn } from '@/components/Table/type'
import { useBlogBaseData } from './useBlogBaseData'

const BlogSearchFormData: FormItem[] = [
  {
    label: '标题',
    type: 'input',
    key: 'title',
    config: {
      placeholder: '请输入博客标题',
      clearable: true,
    },
  },
  {
    label: '分类',
    type: 'select',
    key: 'category',
    options: [
      { label: '技术', value: 'tech' },
      { label: '生活', value: 'life' },
      { label: '金融', value: 'finance' },
      { label: '区块链', value: 'blockchain' },
    ],
    config: {
      placeholder: '请选择种类',
      clearable: true,
    },
  },
  {
    label: '发布时间',
    type: 'date',
    key: 'publish_date',
    config: {
      placeholder: '选择日期',
      type: 'daterange', // 支持日期范围选择
      clearable: true,
    },
  },
]

const BlogTableColumns: SunTableColumn[] = [
  { label: 'ID', prop: 'id' },
  { label: '标题', prop: 'title' },
  {
    label: '种类',
    prop: 'category',
  },
  {
    label: '标签',
    prop: 'tag',
  },
  { label: '字符数', prop: 'byte_num' },
  { label: '评论数', prop: 'comment_num' },
  { label: '浏览量', prop: 'view_num' },
  { label: '创建时间', prop: 'updated_at', sortable: true },
]

interface BlogSearchForm {
  title: string
  category?: string | undefined
  publish_date?: string | string[] | undefined
}

interface SunFormExpose {
  formRef?: {
    validate?: (cb: (valid: boolean) => void) => void
    resetFields?: () => void
  }
}

export interface BlogManagementViewModel {
  blogSearchFormData: FormItem[]
  form: Ref<BlogSearchForm>
  rules: Record<string, Array<{ max: number; message: string; trigger: string }>>
  formRef: Ref<SunFormExpose | undefined>
  onSubmit: () => void
  onReset: () => void
  blogTableColumns: ComputedRef<SunTableColumn[]>
  initializeBlogManagement: () => void
}

export function useBlogManagement(): BlogManagementViewModel {
  const { categoryList, tagList, loadBlogBaseData } = useBlogBaseData()

  const form = ref<BlogSearchForm>({
    title: '',
    category: undefined,
    publish_date: undefined,
  })

  const rules = {
    title: [{ max: 30, message: '关键字不能超过30字符', trigger: 'blur' }],
  }

  const formRef = ref<SunFormExpose>()

  const onSubmit = () => {
    const validate = formRef.value?.formRef?.validate
    validate?.((valid: boolean) => {
      if (valid) {
        ElMessage.success('查询成功!')
        console.log('提交的表单数据:', form.value)
      } else {
        ElMessage.error('请检查输入内容')
      }
    })
  }

  const onReset = () => {
    const resetFields = formRef.value?.formRef?.resetFields
    resetFields?.()
  }

  const blogTableColumns = computed(() => {
    const categoryNameMap = new Map(
      categoryList.map((item) => [String(item.id), item.name])
    )
    const tagNameMap = new Map(tagList.map((item) => [String(item.id), item.name]))

    return BlogTableColumns.map((column, index) => {
      if (index === 2) {
        return {
          ...column,
          formatter: (row: unknown, column: unknown, v: unknown) =>
            categoryNameMap.get(String(v)) || '',
        }
      }

      if (index === 3) {
        return {
          ...column,
          formatter: (row: unknown, column: unknown, v: unknown) => {
            if (!Array.isArray(v)) return ''
            return v.map((id) => tagNameMap.get(String(id)) || '').join(',') || ''
          },
        }
      }

      return column
    })
  })

  const initializeBlogManagement = () => {
    loadBlogBaseData().catch((error) => {
      console.error('获取博客基础数据失败:', error)
    })
  }

  return {
    blogSearchFormData: BlogSearchFormData,
    form,
    rules,
    formRef,
    onSubmit,
    onReset,
    blogTableColumns,
    initializeBlogManagement,
  }
}
