export const API_SUCCESS_CODE = 200
export const DEFAULT_PAGE_SIZE = 10

export interface ApiResponse<TData = unknown> {
  code: number
  data: TData
  msg: string
}

export interface ApiError<TData = unknown> {
  code: number
  msg: string
  data?: TData
}

export interface PageRequest {
  page: number
  pageSize: number
}

export interface PageResult<TItem> {
  list: TItem[]
  total: number
  page: number
  pageSize: number
}
