import {
  ElSelect,
  ElInput,
  ElDatePicker,
  ElCheckboxGroup,
  ElRadioGroup,
  ElUpload,
  ElSwitch,
  ElRate,
} from 'element-plus'

// 支持的 FormItem 类型
export type FormItemType =
  | 'select'
  | 'input'
  | 'date'
  | 'checkbox'
  | 'radio'
  | 'upload'
  | 'textarea'
  | 'switch'
  | 'rate'

// 基础表单项类型
export interface FormItemBase {
  label: string // 表单项的标签
  type: FormItemType // 表单项的类型
  key: string // 用于 v-model 绑定的字段
}

// 下拉框类型 (继承 FormItem 类型)
export interface SelectItem extends FormItemBase {
  type: 'select' // 限定类型为 'select'
  options: {
    // 下拉框的选项
    label: string // 选项显示的文字
    value: string // 选项对应的值
  }[]
  config?: Partial<InstanceType<typeof ElSelect>> // ElSelect 配置 (可选)
}

// 输入框类型 (继承 FormItem 类型)
export interface InputItem extends FormItemBase {
  type: 'input' // 限定类型为 'input'
  config?: Partial<InstanceType<typeof ElInput>> // ElInput 配置 (可选)
}

// 日期选择类型 (继承 FormItem 类型)
export interface DateItem extends FormItemBase {
  type: 'date' // 限定类型为 'date'
  config?: Partial<InstanceType<typeof ElDatePicker>> // ElDatePicker 配置 (可选)
}

// 复选框类型 (继承 FormItem 类型)
export interface CheckboxItem extends FormItemBase {
  type: 'checkbox' // 限定类型为 'checkbox'
  options: {
    // 复选框选项
    label: string
    value: string
  }[]
  config?: Partial<InstanceType<typeof ElCheckboxGroup>> // ElCheckboxGroup 配置 (可选)
}

// 单选框类型 (继承 FormItem 类型)
export interface RadioItem extends FormItemBase {
  type: 'radio' // 限定类型为 'radio'
  options: {
    label: string
    value: string
  }[]
  config?: Partial<InstanceType<typeof ElRadioGroup>> // ElRadioGroup 配置 (可选)
}

// 上传组件类型 (继承 FormItem 类型)
export interface UploadItem extends FormItemBase {
  type: 'upload' // 限定类型为 'upload'
  action: string // 上传的接口地址
  accept?: string // 限定文件类型
  maxSize?: number // 最大文件大小（单位：字节）
  config?: Partial<InstanceType<typeof ElUpload>> // ElUpload 配置 (可选)
}

// 文本框类型 (继承 FormItem 类型)
export interface TextareaItem extends FormItemBase {
  type: 'textarea' // 限定类型为 'textarea'
  rows?: number // 文本框的行数
  config?: Partial<InstanceType<typeof ElInput>> // ElInput 配置 (可选)
}

// 开关组件类型 (继承 FormItem 类型)
export interface SwitchItem extends FormItemBase {
  type: 'switch' // 限定类型为 'switch'
  config?: Partial<InstanceType<typeof ElSwitch>> // ElSwitch 配置 (可选)
}

// 评分组件类型 (继承 FormItem 类型)
export interface RateItem extends FormItemBase {
  type: 'rate' // 限定类型为 'rate'
  config?: Partial<InstanceType<typeof ElRate>> // ElRate 配置 (可选)
}

// 综合类型: 支持多种 FormItem
export type FormItem =
  | SelectItem
  | InputItem
  | DateItem
  | CheckboxItem
  | RadioItem
  | UploadItem
  | TextareaItem
  | SwitchItem
  | RateItem
