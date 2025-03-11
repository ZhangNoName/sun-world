import { ElPagination, ElTable, TableColumnCtx } from 'element-plus'

// 表格列定义
export interface TableColumn<T = any> extends Partial<TableColumnCtx<T>> {
  prop: string & keyof T // 确保 prop 既是 keyof T，又是 string 类型
  label: string
}

// 表格操作按钮
export interface TableAction {
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'large' | 'medium' | 'small' | 'mini'
  handler: (row: any) => void
}

// 表格 Props 定义
export interface SunTableProps {
  columns: TableColumn[]
  data: Record<string, any>[]
  loading?: boolean
  tableConfig?: Partial<InstanceType<typeof ElTable>>
  tableOptions?: Partial<typeof DEFAULT_TABLE_OPTIONS> // 允许部分覆盖默认值
  pageConfig?: Partial<InstanceType<typeof ElPagination>> // 分页配置
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
