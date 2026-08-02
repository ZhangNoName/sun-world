import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react'

import { ManageSearchForm } from './ManageSearchForm'
import { ManageTable } from './ManageTable'
import { useManageCopy } from '../manageCopy'
import './manage-data.css'
import type {
  ManageColumn,
  ManageDataPageRef,
  ManageFetchPage,
  ManagePageRequest,
  ManageTablePageRef,
  TableToolbarContext,
} from './ManageTypes'

export type { ManageDataPageRef } from './ManageTypes'

export interface ManageDataPageProps<T> {
  title: string
  description?: string
  columns: Array<ManageColumn<T>>
  rowKey: (row: T) => string | number
  fetchPage: ManageFetchPage<T>
  pageSize?: number
  pageSizeOptions?: number[]
  onSelectionChange?: (rows: T[]) => void
  toolbar?: {
    left?: ReactNode | ((context: TableToolbarContext<T>) => ReactNode)
    right?: ReactNode | ((context: TableToolbarContext<T>) => ReactNode)
  }
}

interface RequestState extends ManagePageRequest {}

function ManageDataPageInner<T>(
  {
    title,
    description,
    columns,
    rowKey,
    fetchPage,
    pageSize = 10,
    pageSizeOptions,
    onSelectionChange,
    toolbar,
  }: ManageDataPageProps<T>,
  ref: ForwardedRef<ManageDataPageRef<T>>
) {
  const copy = useManageCopy()
  const initialRequest: RequestState = useMemo(
    () => ({ search: {}, page: 1, pageSize }),
    [pageSize]
  )
  const [request, setRequest] = useState<RequestState>(initialRequest)
  const requestRef = useRef(request)
  const draftSearchRef = useRef<Record<string, unknown>>({})
  const [draftSearch, setDraftSearch] = useState<Record<string, unknown>>({})
  const [rows, setRows] = useState<T[]>([])
  const rowsRef = useRef(rows)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [isStale, setIsStale] = useState(false)
  const [selectedRows, setSelectedRows] = useState<T[]>([])
  const selectedRowsRef = useRef<T[]>([])
  selectedRowsRef.current = selectedRows
  const tableRef = useRef<ManageTablePageRef<T>>(null)
  const requestId = useRef(0)
  const controllerRef = useRef<AbortController | null>(null)
  const didLoad = useRef(false)

  const loadRequest = useCallback(
    async (nextRequest: RequestState) => {
      const currentId = ++requestId.current
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      const hadRows = rowsRef.current.length > 0
      requestRef.current = nextRequest
      setRequest(nextRequest)
      setIsLoading(true)
      setErrorMessage('')
      setIsStale(hadRows)
      try {
        const result = await fetchPage(nextRequest, controller.signal)
        if (currentId !== requestId.current) return
        const nextRows = result.rows ?? []
        if (
          nextRequest.page > 1 &&
          result.total > 0 &&
          (nextRequest.page - 1) * nextRequest.pageSize >= result.total
        ) {
          const correctedPage = Math.max(
            1,
            Math.ceil(result.total / nextRequest.pageSize)
          )
          await loadRequest({ ...nextRequest, page: correctedPage })
          return
        }
        rowsRef.current = nextRows
        setRows(nextRows)
        setTotal(result.total ?? 0)
        setIsStale(false)
      } catch (error) {
        if (currentId !== requestId.current || controller.signal.aborted) return
        setErrorMessage(
          error instanceof Error ? error.message : copy.table.loadError
        )
        setIsStale(hadRows)
      } finally {
        if (currentId === requestId.current) setIsLoading(false)
      }
    },
    [copy.table.loadError, fetchPage]
  )

  useEffect(() => {
    if (didLoad.current) return
    didLoad.current = true
    void loadRequest(initialRequest)
    return () => controllerRef.current?.abort()
  }, [initialRequest, loadRequest])

  const handleSearchChange = (name: string, value: unknown) => {
    const next = { ...draftSearchRef.current, [name]: value }
    draftSearchRef.current = next
    setDraftSearch(next)
  }

  const submitSearch = useCallback(async () => {
    await loadRequest({
      ...requestRef.current,
      search: { ...draftSearchRef.current },
      page: 1,
    })
  }, [loadRequest])

  const resetSearch = useCallback(async () => {
    draftSearchRef.current = {}
    setDraftSearch({})
    await loadRequest({ ...requestRef.current, search: {}, page: 1 })
  }, [loadRequest])

  const refresh = useCallback(async () => {
    await loadRequest(requestRef.current)
  }, [loadRequest])

  const resetPage = useCallback(
    async (shouldRefresh = true) => {
      const next = { ...requestRef.current, page: 1 }
      if (shouldRefresh) await loadRequest(next)
      else {
        requestRef.current = next
        setRequest(next)
      }
    },
    [loadRequest]
  )

  useImperativeHandle(
    ref,
    () => ({
      refresh,
      resetPage,
      getSelectedRows: () => selectedRowsRef.current,
      clearSelection: () => {
        setSelectedRows([])
        selectedRowsRef.current = []
        tableRef.current?.clearSelection()
      },
      submitSearch,
      resetSearch,
    }),
    [refresh, resetPage, resetSearch, selectedRows, submitSearch]
  )

  const toolbarContext = useMemo<TableToolbarContext<T>>(
    () => ({
      selectedRows,
      isLoading,
      refresh,
      clearSelection: () => {
        setSelectedRows([])
        selectedRowsRef.current = []
        tableRef.current?.clearSelection()
      },
      resetPage: () => resetPage(),
    }),
    [isLoading, refresh, resetPage, selectedRows]
  )
  const leftToolbar = resolveToolbar(toolbar?.left, toolbarContext)
  const rightToolbar = resolveToolbar(toolbar?.right, toolbarContext)

  const actionToolbar =
    leftToolbar || rightToolbar ? (
      <div className="manage-data-page__toolbar-actions">
        {leftToolbar}
        {rightToolbar}
      </div>
    ) : null

  return (
    <main className="manage-data-page">
      <header className="manage-data-page__heading">
        <div>
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </div>
      </header>
      <ManageTable
        ref={tableRef}
        columns={columns}
        rows={rows}
        rowKey={rowKey}
        page={request.page}
        pageSize={request.pageSize}
        pageSizeOptions={pageSizeOptions}
        total={total}
        isLoading={isLoading}
        errorMessage={errorMessage}
        isStale={isStale}
        onRetry={() => void refresh()}
        onPageChange={(page) => {
          void loadRequest({ ...requestRef.current, page })
        }}
        onPageSizeChange={(nextPageSize) => {
          void loadRequest({
            ...requestRef.current,
            page: 1,
            pageSize: nextPageSize,
          })
        }}
        onSelectionChange={(nextRows) => {
          selectedRowsRef.current = nextRows
          setSelectedRows(nextRows)
          onSelectionChange?.(nextRows)
        }}
        toolbarLeft={actionToolbar}
        toolbarRight={
          <ManageSearchForm
            columns={columns}
            values={draftSearch}
            onChange={handleSearchChange}
            onSubmit={submitSearch}
            onReset={resetSearch}
            submitting={isLoading}
            compact
          />
        }
      />
    </main>
  )
}

function resolveToolbar<T>(
  slot:
    | ReactNode
    | ((context: TableToolbarContext<T>) => ReactNode)
    | undefined,
  context: TableToolbarContext<T>
) {
  return typeof slot === 'function' ? slot(context) : slot
}

export const ManageDataPage = forwardRef(ManageDataPageInner) as <T>(
  props: ManageDataPageProps<T> & { ref?: Ref<ManageDataPageRef<T>> }
) => ReactElement | null
