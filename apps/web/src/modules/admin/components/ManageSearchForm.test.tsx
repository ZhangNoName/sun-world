import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { setLocale } from '@/i18n'
import { ManageSearchForm } from './ManageSearchForm'
import type { ManageColumn } from './ManageTypes'

type Row = {
  title: string
  status: string
  owner: string
  category: number
}

describe('ManageSearchForm', () => {
  beforeEach(async () => {
    await setLocale('zh')
  })

  it('expands derived search fields and exposes submit/reset actions', () => {
    const onSubmit = vi.fn()
    const onReset = vi.fn()
    const columns: ManageColumn<Row>[] = [
      { key: 'title', title: 'Title', search: true },
      { key: 'status', title: 'Status', search: true },
      { key: 'owner', title: 'Owner', search: true },
      { key: 'category', title: 'Category', type: 'number', search: true },
    ]

    render(
      <ManageSearchForm
        columns={columns}
        values={{}}
        onChange={vi.fn()}
        onSubmit={onSubmit}
        onReset={onReset}
      />
    )

    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.queryByLabelText('Category')).not.toBeInTheDocument()

    expect(screen.getByRole('heading', { name: '搜索' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '更多筛选' }))
    expect(screen.getByLabelText('Category')).toBeInTheDocument()

    fireEvent.submit(
      screen.getByRole('button', { name: '搜索' }).closest('form')!
    )
    fireEvent.click(screen.getByRole('button', { name: '重置' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onReset).toHaveBeenCalledTimes(1)
  })
})
