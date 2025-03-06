import { FormItem } from '@/components/Form/type'

export const blogSearchForm: FormItem[] = [
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
