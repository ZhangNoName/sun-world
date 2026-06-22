import type { SunControlStateProps } from './shared'

export interface SunChatComposerProps extends SunControlStateProps {
  modelValue?: string
  placeholder?: string
  loading?: boolean
  clearOnSubmit?: boolean
  submitLabel?: string
}

export interface SunChatComposerEmits {
  'update:modelValue': [value: string]
  submit: [value: string]
}
