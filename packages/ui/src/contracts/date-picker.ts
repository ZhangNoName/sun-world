import type { SunControlStateProps } from './shared'

export type SunDatePickerType = 'date' | 'daterange'
export type SunDateRangeValue = [string, string]
export type SunDatePickerValue = string | Date | SunDateRangeValue | null

export interface SunDatePickerProps extends SunControlStateProps {
  modelValue?: SunDatePickerValue
  type?: SunDatePickerType
  placeholder?: string
  clearable?: boolean
  mobile?: boolean
}

export interface SunDatePickerEmits {
  'update:modelValue': [value: SunDatePickerValue]
  change: [value: SunDatePickerValue]
  clear: []
}
