import { ElTable } from 'element-plus'
import type { SunPaginationProps } from '@sun-world/ui/pagination'

// 表格列定义
export interface SunTableColumn<T extends Record<string, unknown> = Record<string, unknown>> {
  prop: string & keyof T // 确保 prop 既是 keyof T，又是 string 类型
  label: string
  width?: number | string
  minWidth?: number | string
  fixed?: boolean | 'left' | 'right'
  align?: 'left' | 'center' | 'right'
  sortable?: boolean | 'custom'
  [key: string]: unknown
}

// 表格操作按钮
export interface TableAction {
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'large' | 'medium' | 'small' | 'mini'
  handler: (row: any) => void
}

export interface SunTablePageRequest {
  page: number
  pageSize: number
}

export interface SunTablePageResult {
  list: Record<string, any>[]
  page?: number
  pageSize?: number
  total: number
}

export type SunTableFetchPage = (
  request: SunTablePageRequest
) => Promise<SunTablePageResult>

// 表格 Props 定义
export interface SunTableProps {
  columns: SunTableColumn[]
  data?: Record<string, any>[]
  loading?: boolean
  tableConfig?: Partial<InstanceType<typeof ElTable>>
  tableOptions?: Partial<typeof DEFAULT_TABLE_OPTIONS> // 允许部分覆盖默认值
  pageConfig?: Partial<SunPaginationProps> // SunPagination 配置
  fetchPage: SunTableFetchPage
}

// 默认的表格配置
export const DEFAULT_TABLE_OPTIONS = {
  showSelection: true,
  showPagination: true,
  showIndex: true,
  actions: [] as TableAction[],
  pageSize: 10,
  currentPage: 1,
  total: 0,
}

// 默认的分页配置
export const DEFAULT_PAGE_CONFIG = {
  pageSize: 10,
  currentPage: 1,
  background: true, // 默认带背景
  layout: 'prev, pager, next, jumper', // 默认分页布局
}

export const CLOUMN_WIDTH = {
  mini: 80,
  small: 100,
  normal: 150,
  large: 200,
  full: 300,
  index: 80,
  selection: 50,
}
