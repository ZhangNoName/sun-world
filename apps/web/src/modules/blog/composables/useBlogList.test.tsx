import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'

const { fetchBlogPage } = vi.hoisted(() => ({ fetchBlogPage: vi.fn() }))
vi.mock('../api', () => ({ fetchBlogPage }))

import { useBlogList } from './useBlogList'

describe('useBlogList', () => {
  beforeEach(() => fetchBlogPage.mockReset())
  it('maps labels and exhausts pagination without duplicate requests', async () => {
    fetchBlogPage.mockResolvedValueOnce({
      list: [
        {
          id: 1,
          title: 'React migration',
          abstract: 'body',
          tag: [2],
          category: 3,
          byte_num: 10,
          comment_num: 1,
          view_num: 2,
        },
      ],
      total: 1,
    })

    const { result } = renderHook(() =>
      useBlogList(
        [{ id: 2, name: 'frontend-basic-01' }],
        [{ id: 3, name: 'Frontend' }],
        12
      )
    )

    await act(() => result.current.loadFirstPage())
    expect(result.current.items[0]).toMatchObject({
      id: '1',
      tags: ['前端基础'],
      category: 'Frontend',
    })
    expect(result.current.hasMore).toBe(false)

    await act(() => result.current.loadMore())
    expect(fetchBlogPage).toHaveBeenCalledTimes(1)
  })
  it('exhausts candidate pages even when public bodies are missing', async () => {
    fetchBlogPage
      .mockResolvedValueOnce({ list: [], total: 3 })
      .mockResolvedValueOnce({
        list: [{ id: 3, title: 'Visible', abstract: 'body', tag: [] }],
        total: 3,
      })
    const { result } = renderHook(() => useBlogList([], [], 2))
    await act(() => result.current.loadFirstPage())
    expect(result.current.items).toEqual([])
    expect(result.current.hasMore).toBe(true)
    await act(() => result.current.loadMore())
    expect(result.current.items.map((item) => item.id)).toEqual(['3'])
    expect(result.current.hasMore).toBe(false)
    await act(() => result.current.loadMore())
    expect(fetchBlogPage).toHaveBeenCalledTimes(2)
  })
})
