import type { SunControlStateProps } from './shared'

export interface SunPaginationProps extends SunControlStateProps {
  page: number
  pageSize: number
  total: number
  mobile?: boolean
  loading?: boolean
  hasMore?: boolean
  autoLoadOnReachEnd?: boolean
}

export interface SunPaginationEmits {
  'update:page': [page: number]
  pageChange: [page: number]
  loadMore: []
}
