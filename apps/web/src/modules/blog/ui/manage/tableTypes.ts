export interface SunTableColumn<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  prop: string & keyof T
  label: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  formatter?: (row: T, value: unknown) => string
}
export interface SunTablePageRequest {
  page: number
  pageSize: number
}
export interface SunTablePageResult<T = Record<string, unknown>> {
  list: T[]
  page?: number
  pageSize?: number
  total: number
}
export type SunTableFetchPage<T = Record<string, unknown>> = (
  request: SunTablePageRequest
) => Promise<SunTablePageResult<T>>
