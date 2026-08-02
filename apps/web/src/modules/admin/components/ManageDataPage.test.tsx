import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Button } from '@sun-world/base-ui/button'
import { ManageDataPage, type ManageDataPageRef } from './ManageDataPage'
import type { ManageColumn } from './ManageTypes'

type Row = { id: number; name: string }

describe('ManageDataPage', () => {
  it('ignores a slower stale response and exposes imperative search commands', async () => {
    const deferred: Array<(result: { rows: Row[]; total: number }) => void> = []
    const fetchPage = vi.fn(
      () =>
        new Promise<{ rows: Row[]; total: number }>((resolve) =>
          deferred.push(resolve)
        )
    )
    const ref = createRef<ManageDataPageRef<Row>>()
    const columns: ManageColumn<Row>[] = [
      { key: 'name', title: 'Name', search: true },
    ]

    render(
      <ManageDataPage
        ref={ref}
        title="Users"
        columns={columns}
        rowKey={(row) => row.id}
        fetchPage={fetchPage}
      />
    )

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1))
    const first = deferred.shift()!
    let refresh!: Promise<void>
    await act(async () => {
      refresh = ref.current!.refresh()
    })
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2))
    const second = deferred.shift()!
    await act(async () => {
      second({ rows: [{ id: 2, name: 'Fresh' }], total: 1 })
      first({ rows: [{ id: 1, name: 'Stale' }], total: 1 })
    })
    await refresh

    expect(await screen.findByText('Fresh')).toBeInTheDocument()
    expect(screen.queryByText('Stale')).not.toBeInTheDocument()
    expect(ref.current?.getSelectedRows()).toEqual([])
  })

  it('moves back to the last valid page when a deletion empties the current page', async () => {
    const requests: Array<{
      page: number
      resolve: (value: {
        rows: Array<{ id: number; name: string }>
        total: number
      }) => void
    }> = []
    const fetchPage = vi.fn(
      ({ page }: { page: number }) =>
        new Promise<{ rows: Row[]; total: number }>((resolve) => {
          requests.push({ page, resolve })
        })
    )
    const ref = createRef<ManageDataPageRef<Row>>()
    render(
      <ManageDataPage
        ref={ref}
        title="Rows"
        columns={[{ key: 'name', title: 'Name' }]}
        rowKey={(row) => row.id}
        fetchPage={fetchPage}
        pageSize={2}
      />
    )
    await waitFor(() => expect(requests).toHaveLength(1))
    await act(async () => {
      requests[0]?.resolve({
        rows: [
          { id: 1, name: 'One' },
          { id: 2, name: 'Two' },
        ],
        total: 4,
      })
    })
    await waitFor(() => expect(screen.getByText('One')).toBeInTheDocument())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '2' }))
    })
    await waitFor(() => expect(requests).toHaveLength(2))
    await act(async () => {
      requests[1]?.resolve({ rows: [{ id: 3, name: 'Three' }], total: 3 })
    })
    await waitFor(() => expect(screen.getByText('Three')).toBeInTheDocument())
    let refresh!: Promise<void>
    await act(async () => {
      refresh = ref.current!.refresh()
    })
    await waitFor(() => expect(requests).toHaveLength(3))
    await act(async () => {
      requests[2]?.resolve({ rows: [], total: 2 })
    })
    await waitFor(() => expect(requests).toHaveLength(4))
    expect(requests[3]?.page).toBe(1)
    await act(async () => {
      requests[3]?.resolve({ rows: [{ id: 2, name: 'Two' }], total: 2 })
    })
    await refresh
  })

  it('keeps search and create actions in one toolbar with create on the left', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: 'One' }],
      total: 25,
    })
    const columns: ManageColumn<Row>[] = [
      { key: 'name', title: 'Name', search: true },
    ]

    render(
      <ManageDataPage
        title="Rows"
        columns={columns}
        rowKey={(row) => row.id}
        fetchPage={fetchPage}
        toolbar={{ right: <Button>Create</Button> }}
      />
    )

    await screen.findByText('One')
    expect(screen.getByRole('heading', { name: 'Rows' })).toBeInTheDocument()
    const toolbar = document.querySelector('.manage-table-toolbar')
    const actions = document.querySelector('.manage-data-page__toolbar-actions')
    const createButton = screen.getByRole('button', { name: 'Create' })

    expect(toolbar).toContainElement(screen.getByLabelText('Name'))
    expect(toolbar).toContainElement(createButton)
    expect(actions?.firstElementChild).toContainElement(createButton)
    expect(
      document.querySelector('.manage-search-card')
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('navigation').closest('.manage-table-card')
    ).toBeInTheDocument()
    expect(document.querySelector('.manage-table-scroll')).toHaveAttribute(
      'data-scrollable',
      'both'
    )
  })

  it('reloads the first page when the page size changes', async () => {
    const fetchPage = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: 'One' }],
      total: 25,
    })
    const columns: ManageColumn<Row>[] = [{ key: 'name', title: 'Name' }]

    render(
      <ManageDataPage
        title="Rows"
        columns={columns}
        rowKey={(row) => row.id}
        fetchPage={fetchPage}
        pageSize={10}
        pageSizeOptions={[10, 20]}
      />
    )

    await screen.findByText('One')
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: '每页条数' }),
      '20'
    )
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2))

    expect(fetchPage.mock.calls[1]?.[0]).toMatchObject({
      page: 1,
      pageSize: 20,
    })
  })
})
