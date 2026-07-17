export type FormItemType =
  | 'select'
  | 'input'
  | 'date'
  | 'textarea'
  | 'checkbox'
  | 'radio'
  | 'switch'
export interface FormOption {
  label: string
  value: string
}
export interface FormItem {
  label: string
  type: FormItemType
  key: string
  options?: FormOption[]
  placeholder?: string
}
