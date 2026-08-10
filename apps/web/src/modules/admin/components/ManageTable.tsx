import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'

import { Button } from '@sun-world/base-ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from '@sun-world/base-ui/card'
import { Checkbox } from '@sun-world/base-ui/checkbox'
import { SunPagination } from '@sun-world/ui/pagination'
import { SwNativeSelect } from '@sun-world/ui/sw-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sun-world/base-ui/table'

import { fetchDictionary } from '../data/dictionaryRepository'
import { useManageCopy } from '../manageCopy'
import type {
  ManageColumn,
  ManageColumnType,
  ManageTablePageRef,
} from './ManageTypes'

export type { ManageTablePageRef } from './ManageTypes'

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50]

export interface ManageTableProps<T> {
  columns: Array<ManageColumn<T>>
  rows: T[]
  rowKey: (row: T) => string | number
  page: number
  pageSize: number
  pageSizeOptions?: number[]
  total: number
  isLoading?: boolean
  errorMessage?: string
  isStale?: boolean
  isEmpty?: boolean
  onRetry?: () => void
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  onSelectionChange?: (rows: T[]) => void
  toolbarLeft?: ReactNode
  toolbarRight?: ReactNode
}

function ManageTableInner<T>(
  {
    columns,
    rows,
    rowKey,
    page,
    pageSize,
    pageSizeOptions,
    total,
    isLoading = false,
    errorMessage,
    isStale = false,
    isEmpty = !isLoading && rows.length === 0 && !errorMessage,
    onRetry,
    onPageChange,
    onPageSizeChange,
    onSelectionChange,
    toolbarLeft,
    toolbarRight,
  }: ManageTableProps<T>,
  ref: ForwardedRef<ManageTablePageRef<T>>
) {
  const copy = useManageCopy()
  const [selectedKeys, setSelectedKeys] = useState<Set<string | number>>(
    new Set()
  )
  const previousPage = useRef(page)
  const [dictionaryValues, setDictionaryValues] = useState<
    Record<
      string,
      Array<{ value: string; label: string; color?: string | null }>
    >
  >({})
  const dictionaryCodes = useMemo(
    () =>
      columns
        .filter((column) => column.type === 'dict' && column.dictCode)
        .map((column) => column.dictCode!)
        .filter((code, index, all) => all.indexOf(code) === index),
    [columns]
  )
  const resolvedPageSizeOptions = useMemo(
    () =>
      [
        ...new Set([
          pageSize,
          ...(pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS),
        ]),
      ]
        .filter((value) => Number.isFinite(value) && value > 0)
        .sort((left, right) => left - right),
    [pageSize, pageSizeOptions]
  )
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedKeys.has(rowKey(row))),
    [rowKey, rows, selectedKeys]
  )
  const selectedRowsRef = useRef<T[]>([])
  selectedRowsRef.current = selectedRows

  useEffect(() => {
    if (previousPage.current !== page) {
      previousPage.current = page
      setSelectedKeys(new Set())
      onSelectionChange?.([])
    }
  }, [onSelectionChange, page])

  useEffect(() => {
    let active = true
    void Promise.all(
      dictionaryCodes.map(async (code) => {
        try {
          const values = await fetchDictionary(code)
          if (active)
            setDictionaryValues((current) => ({ ...current, [code]: values }))
        } catch {
          // The raw value is intentionally rendered when dictionary loading fails.
        }
      })
    )
    return () => {
      active = false
    }
  }, [dictionaryCodes])

  useImperativeHandle(
    ref,
    () => ({
      getSelectedRows: () => selectedRowsRef.current,
      clearSelection: () => {
        setSelectedKeys(new Set())
        selectedRowsRef.current = []
        onSelectionChange?.([])
      },
      refresh: async () => undefined,
      resetPage: async () => undefined,
      submitSearch: async () => undefined,
      resetSearch: async () => undefined,
    }),
    [onSelectionChange, selectedRows]
  )

  const toggleRow = (row: T) => {
    const key = rowKey(row)
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      onSelectionChange?.(
        rows.filter((candidate) => next.has(rowKey(candidate)))
      )
      return next
    })
  }

  const toggleAll = () => {
    const shouldSelect = rows.some((row) => !selectedKeys.has(rowKey(row)))
    const next = shouldSelect
      ? new Set(rows.map(rowKey))
      : new Set<string | number>()
    setSelectedKeys(next)
    onSelectionChange?.(shouldSelect ? rows : [])
  }

  const renderCell = (column: ManageColumn<T>, row: T, rowIndex: number) => {
    const value = row[column.key]
    if (column.render) return column.render({ row, value, column, rowIndex })
    if (column.type === 'dict' && column.dictCode) {
      const option = dictionaryValues[column.dictCode]?.find(
        (item) => item.value === String(value)
      )
      if (option) {
        const style = option.color
          ? ({ '--manage-dict-color': option.color } as CSSProperties)
          : undefined
        return (
          <span className="manage-dict-tag" style={style}>
            {option.label}
          </span>
        )
      }
    }
    if (column.formatter) return column.formatter(value, row)
    return formatCellValue(value, column.type, copy)
  }

  if (isLoading && !rows.length) {
    return (
      <div className="manage-table-state" role="status" aria-live="polite">
        {copy.table.loading}
      </div>
    )
  }

  if (errorMessage && !rows.length) {
    return (
      <div
        className="manage-table-state manage-table-state--error"
        role="alert"
      >
        <p>{errorMessage}</p>
        {onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            {copy.table.retry}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <Card
      className="manage-table-card"
      data-dashboard-surface="table"
      role="region"
      aria-label={copy.table.pageNavigation}
    >
      {isStale && errorMessage ? (
        <p className="manage-table-stale" role="status" aria-live="polite">
          {errorMessage}
        </p>
      ) : null}
      {toolbarLeft || toolbarRight ? (
        <CardHeader className="manage-table-toolbar">
          <div className="manage-table-toolbar__left">{toolbarLeft}</div>
          <div className="manage-table-toolbar__right">{toolbarRight}</div>
        </CardHeader>
      ) : null}
      <CardContent className="manage-table-card__body">
        {isEmpty ? (
          <div className="manage-table-state" role="status">
            {copy.table.empty}
          </div>
        ) : (
          <div className="manage-table-scroll" data-scrollable="both">
            <Table className="manage-table">
              <TableHeader data-sticky-header="true">
                <TableRow>
                  <TableHead
                    scope="col"
                    className="manage-table__head manage-table__selection"
                  >
                    <Checkbox
                      aria-label={copy.table.selectAll}
                      checked={
                        rows.length > 0 &&
                        rows.every((row) => selectedKeys.has(rowKey(row)))
                      }
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  {columns.map((column) => (
                    <TableHead
                      key={column.key}
                      scope="col"
                      className="manage-table__head"
                      style={column.width ? { width: column.width } : undefined}
                    >
                      {column.title}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, rowIndex) => (
                  <TableRow key={rowKey(row)}>
                    <TableCell className="manage-table__selection">
                      <Checkbox
                        aria-label={copy.table.selectRow(
                          String(columns[0] ? row[columns[0].key] : rowKey(row))
                        )}
                        checked={selectedKeys.has(rowKey(row))}
                        onCheckedChange={() => toggleRow(row)}
                      />
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell key={column.key}>
                        {renderCell(column, row, rowIndex)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <CardFooter className="manage-table-pagination">
        <div className="manage-table-pagination__controls">
          <div className="manage-table-pagination__page-size">
            <span>{copy.table.pageSizeLabel}</span>
            <SwNativeSelect
              className="manage-table-page-size"
              aria-label={copy.table.pageSizeLabel}
              value={String(pageSize)}
              onValueChange={(value) => {
                const nextPageSize = Number(value)
                if (Number.isFinite(nextPageSize) && nextPageSize > 0) {
                  onPageSizeChange?.(nextPageSize)
                }
              }}
              disabled={isLoading || !onPageSizeChange}
              options={resolvedPageSizeOptions.map((option) => ({
                value: String(option),
                label: copy.table.pageSizeOption(option),
              }))}
            />
          </div>
          <SunPagination
            label={copy.table.pageNavigation}
            page={page}
            pageSize={pageSize}
            total={total}
            loading={isLoading}
            onPageChange={onPageChange}
          />
        </div>
      </CardFooter>
    </Card>
  )
}

function formatCellValue(
  value: unknown,
  type: ManageColumnType | undefined,
  copy: ReturnType<typeof useManageCopy>
) {
  if (value === undefined || value === null || value === '') return '—'
  if (type === 'boolean') return value ? copy.table.yes : copy.table.no
  if (type === 'date') {
    const date = new Date(String(value))
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
  }
  return String(value)
}

export const ManageTable = forwardRef(ManageTableInner) as <T>(
  props: ManageTableProps<T> & { ref?: Ref<ManageTablePageRef<T>> }
) => ReactElement | null
