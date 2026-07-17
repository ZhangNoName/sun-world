import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'

const { createBlog } = vi.hoisted(() => ({
  createBlog: vi.fn().mockResolvedValue({ id: 1 }),
}))
vi.mock('../api', () => ({ createBlog }))
vi.mock('./useBlogBaseData', () => ({
  useBlogBaseData: () => ({
    categoryList: [{ id: 3, name: 'React' }],
    tagList: [{ id: 2, name: 'Migration' }],
    loadBlogBaseData: vi.fn().mockResolvedValue(undefined),
  }),
}))
vi.mock('@sun-world/ui/toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { useBlogAuthoring } from './useBlogAuthoring'

describe('useBlogAuthoring', () => {
  it('blocks an empty title and sends selected category and tag ids', async () => {
    const { result } = renderHook(useBlogAuthoring)
    await act(() => result.current.saveBlog())
    expect(createBlog).not.toHaveBeenCalled()

    act(() => {
      result.current.setTitle('React rewrite')
      result.current.setBlogContent('content')
      result.current.setBlogCategory('3')
      result.current.setBlogTag(['2'])
    })
    await act(() => result.current.saveBlog())
    expect(createBlog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'React rewrite',
        category: '3',
        tag: ['2'],
      })
    )
  })
})
