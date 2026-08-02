import type { ReactNode } from 'react'

export type ManageColumnType = 'text' | 'number' | 'date' | 'boolean' | 'dict'

export interface SearchFieldConfig {
  type?: SchemaFieldType
  label?: string
  placeholder?: string
  defaultValue?: unknown
  options?: Array<{ value: string; label: string }>
  props?: Record<string, unknown>
}

export interface CellRenderContext<T> {
  row: T
  value: unknown
  column: ManageColumn<T>
  rowIndex: number
}

export interface ManageColumn<T> {
  key: keyof T & string
  title: string
  width?: number
  sortable?: boolean
  type?: ManageColumnType
  dictCode?: string
  search?: boolean | SearchFieldConfig
  render?: (context: CellRenderContext<T>) => ReactNode
  formatter?: (value: unknown, row: T) => ReactNode
}

export type SchemaFieldType =
  | 'input'
  | 'number'
  | 'select'
  | 'textarea'
  | 'switch'
  | 'date'
  | 'dict'
  | 'custom'

export interface SchemaField<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> {
  name: keyof TValues & string
  label: string
  type: SchemaFieldType
  description?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  options?: Array<{ value: string; label: string }>
  dictCode?: string
  render?: (context: {
    value: unknown
    error?: string
    onChange: (value: unknown) => void
  }) => ReactNode
}

export interface ManagePageRequest {
  search: Record<string, unknown>
  page: number
  pageSize: number
  sort?: { key: string; direction: 'asc' | 'desc' }
}

export interface ManagePageResult<T> {
  rows: T[]
  total: number
  page?: number
  pageSize?: number
}

export type ManageFetchPage<T> = (
  request: ManagePageRequest,
  signal: AbortSignal
) => Promise<ManagePageResult<T>>

export interface TableToolbarContext<T> {
  selectedRows: T[]
  isLoading: boolean
  refresh: () => Promise<void>
  clearSelection: () => void
  resetPage: () => Promise<void>
}

export interface ManageTablePageRef<T> {
  refresh(): Promise<void>
  resetPage(refresh?: boolean): Promise<void>
  getSelectedRows(): T[]
  clearSelection(): void
  submitSearch(): Promise<void>
  resetSearch(): Promise<void>
}

export type ManageDataPageRef<T> = ManageTablePageRef<T>
