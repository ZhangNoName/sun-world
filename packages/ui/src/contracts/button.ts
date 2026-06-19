import type { SunControlStateProps } from './shared'

export type SunButtonVariant =
  | 'primary'
  | 'secondary'
  | 'danger'
  | 'ghost'
  | 'link'
  | 'icon'
export type SunButtonSize = 'sm' | 'md' | 'lg' | 'icon'

export interface SunButtonProps extends SunControlStateProps {
  variant?: SunButtonVariant
  size?: SunButtonSize
  loading?: boolean
  nativeType?: 'button' | 'submit' | 'reset'
  title?: string
}

export interface SunButtonEmits {
  click: [event: MouseEvent]
}
