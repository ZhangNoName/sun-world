import type { SunComponentState } from './shared'

export interface SunTagProps {
  label: string | number
  href?: string
  color?: string
  disabled?: boolean
  state?: SunComponentState
  ariaLabel?: string
}
