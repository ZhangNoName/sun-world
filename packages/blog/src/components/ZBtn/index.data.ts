export type ZBtnVariant =
  | 'default'
  | 'destructive'
  | 'outline'
  | 'secondary'
  | 'ghost'
  | 'link'
  | 'icon'
  | 'primary' // 保持兼容
  | 'success'
  | 'warning'
  | 'info'

export type ZBtnSize = 'default' | 'sm' | 'lg' | 'icon'

export const BgColor: Record<string, string> = {
  primary: 'var(--primary)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--destructive)',
  info: 'var(--secondary)',
  default: 'var(--primary)',
  destructive: 'var(--destructive)',
  secondary: 'var(--secondary)',
}
