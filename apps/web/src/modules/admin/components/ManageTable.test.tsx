import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Button } from '@sun-world/base-ui/button'
import { setLocale } from '@/i18n'
import { ManageTable, type ManageTablePageRef } from './ManageTable'
import type { ManageColumn } from './ManageTypes'

type Row = { id: number; status: string; title: string }

const columns: ManageColumn<Row>[] = [
  {
    key: 'title',
    title: 'Title',
    render: ({ value }) => <strong>{String(value)}</strong>,
  },
  {
    key: 'status',
    title: 'Status',
    formatter: (value) => `formatted:${String(value)}`,
  },
]

describe('ManageTable', () => {
  beforeEach(async () => {
    await setLocale('zh')
  })

  it('uses custom render before formatter and exposes page-local selection', async () => {
    const onSelectionChange = vi.fn()
    const ref = createRef<ManageTablePageRef<Row>>()

    render(
      <ManageTable
        ref={ref}
        columns={columns}
        rows={[{ id: 1, status: 'published', title: 'Hello' }]}
        rowKey={(row) => row.id}
        page={1}
        pageSize={10}
        total={1}
        onPageChange={vi.fn()}
        onSelectionChange={onSelectionChange}
      />
    )

    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('formatted:published')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('checkbox', { name: '选择 Hello' }))
    })
    await waitFor(() =>
      expect(onSelectionChange).toHaveBeenCalledWith([
        { id: 1, status: 'published', title: 'Hello' },
      ])
    )
    expect(ref.current?.getSelectedRows()).toEqual([
      { id: 1, status: 'published', title: 'Hello' },
    ])
    await act(async () => {
      ref.current?.clearSelection()
    })
    expect(ref.current?.getSelectedRows()).toEqual([])
  })

  it('renders distinct loading, error, empty, and stale-data states', () => {
    const props = {
      columns,
      rows: [] as Row[],
      rowKey: (row: Row) => row.id,
      page: 1,
      pageSize: 10,
      total: 0,
      onPageChange: vi.fn(),
    }

    const { rerender } = render(<ManageTable {...props} isLoading />)
    expect(screen.getByText('正在加载数据…')).toBeInTheDocument()
    rerender(
      <ManageTable {...props} errorMessage="Could not load" onRetry={vi.fn()} />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load')
    rerender(<ManageTable {...props} isEmpty />)
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
    rerender(
      <ManageTable
        {...props}
        rows={[{ id: 2, status: 'draft', title: 'Stale' }]}
        isStale
        errorMessage="Refresh failed"
      />
    )
    expect(screen.getByText('Stale')).toBeInTheDocument()
    expect(screen.getByText('Refresh failed')).toBeInTheDocument()
  })

  it('supports toolbar content supplied by the data page', () => {
    render(
      <ManageTable
        columns={columns}
        rows={[]}
        rowKey={(row) => row.id}
        page={1}
        pageSize={10}
        total={0}
        onPageChange={vi.fn()}
        toolbarLeft={<span>Batch actions</span>}
        toolbarRight={<Button size="sm">Create</Button>}
      />
    )
    expect(screen.getByText('Batch actions')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  it('uses the shadcn table primitives with a scroll viewport and paginates', () => {
    const onPageChange = vi.fn()

    render(
      <ManageTable
        columns={columns}
        rows={[{ id: 1, status: 'published', title: 'Hello' }]}
        rowKey={(row) => row.id}
        page={1}
        pageSize={10}
        total={25}
        onPageChange={onPageChange}
        toolbarLeft={<span>Actions</span>}
      />
    )

    const table = screen.getByRole('table')
    const tableCard = table.closest('.manage-table-card')
    expect(table).toHaveAttribute('data-slot', 'table')
    expect(tableCard).toHaveAttribute('data-slot', 'card')
    expect(tableCard).toHaveAttribute('data-dashboard-surface', 'table')
    expect(table.parentElement).toHaveAttribute('data-slot', 'table-container')
    expect(table.querySelector('thead')).toHaveAttribute(
      'data-sticky-header',
      'true'
    )
    expect(table.querySelector('th')).toHaveClass('manage-table__head')
    expect(document.querySelector('.manage-table-scroll')).toHaveAttribute(
      'data-scrollable',
      'both'
    )
    expect(document.querySelector('.manage-table-toolbar')).toHaveAttribute(
      'data-slot',
      'card-header'
    )
    expect(
      screen.getByRole('navigation').closest('.manage-table-pagination')
    ).toHaveAttribute('data-slot', 'card-footer')

    fireEvent.click(screen.getByRole('button', { name: '2' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })

  it('allows changing the page size from the pagination controls', async () => {
    const onPageSizeChange = vi.fn()

    render(
      <ManageTable
        columns={columns}
        rows={[{ id: 1, status: 'published', title: 'Hello' }]}
        rowKey={(row) => row.id}
        page={1}
        pageSize={10}
        pageSizeOptions={[10, 20]}
        total={25}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />
    )

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '每页条数' }),
      '20'
    )

    expect(onPageSizeChange).toHaveBeenCalledWith(20)
  })
})
