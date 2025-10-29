export const TestFormData = [
  {
    label: '标题',
    type: 'input',
    key: 'title',
    rules: [{ required: true, message: '请输入标题' }],
  },
  {
    label: '内容',
    type: 'textarea',
    key: 'content',
    rules: [{ required: true, message: '请输入内容' }],
  },
  {
    label: '分类',
    type: 'select',
    key: 'category',
    options: [
      {
        label: '分类1',
        value: '1',
      },
      {
        label: '分类2',
        value: '2',
      },
    ],
  },
  {
    label: '标签',
    type: 'checkbox',
  },
]
