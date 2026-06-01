import { FormItem } from '@/components/Form/type'
import { SunTableColumn } from '@/components/Table/type'

export const BlogSearchFormData: FormItem[] = [
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
export const BlogTableColumns: SunTableColumn[] = [
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
