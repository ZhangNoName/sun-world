import { act, renderHook } from '@testing-library/react'

import { fetchBlogById } from '../api'
import type { BlogDetail } from '../types'
import { useBlogReader } from './useBlogReader'

vi.mock('../api')

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function blogDetail(id: number, title: string): BlogDetail {
  return {
    abstract: title,
    author: 'Sun World',
    byte_num: 10,
    category: null,
    comment_num: 0,
    content: title,
    created_at: '2026-07-17T00:00:00Z',
    id,
    tag: [],
    title,
    updated_at: '2026-07-17T00:00:00Z',
    view_num: 0,
  }
}

describe('useBlogReader', () => {
  it('keeps the newest article when responses resolve out of order', async () => {
    const first = deferred<BlogDetail>()
    const second = deferred<BlogDetail>()
    vi.mocked(fetchBlogById)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const view = renderHook(({ id }) => useBlogReader(id), {
      initialProps: { id: '1' },
    })

    let oldLoad!: Promise<void>
    act(() => {
      oldLoad = view.result.current.loadBlog()
    })
    view.rerender({ id: '2' })
    let newLoad!: Promise<void>
    act(() => {
      newLoad = view.result.current.loadBlog()
    })
    await act(() => {
      second.resolve(blogDetail(2, 'new'))
      return newLoad
    })
    await act(() => {
      first.resolve(blogDetail(1, 'old'))
      return oldLoad
    })

    expect(view.result.current.blogInfo.id).toBe(2)
    expect(view.result.current.blogInfo.title).toBe('new')
    expect(view.result.current.loading).toBe(false)
  })
})
