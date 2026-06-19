import type { SunControlStateProps } from './shared'

export interface SunListItem {
  id: string | number
  [key: string]: unknown
}

export interface SunListColumn<TItem = SunListItem> {
  key: keyof TItem & string
  label: string
}

export interface SunListProps<TItem = SunListItem> extends SunControlStateProps {
  items: TItem[]
  columns?: Array<SunListColumn<TItem>>
  loading?: boolean
  mobile?: boolean
  emptyText?: string
}

export interface SunListEmits<TItem = SunListItem> {
  select: [item: TItem]
}
