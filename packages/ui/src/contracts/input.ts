import type { SunControlStateProps } from './shared'

export type SunInputType = 'text' | 'search' | 'password' | 'textarea' | 'email'
export type SunInputSize = 'sm' | 'md' | 'lg'

export interface SunInputProps extends SunControlStateProps {
  modelValue?: string
  type?: SunInputType
  size?: SunInputSize
  placeholder?: string
  clearable?: boolean
  showPassword?: boolean
}

export interface SunInputEmits {
  'update:modelValue': [value: string]
  change: [value: string]
  clear: []
}
