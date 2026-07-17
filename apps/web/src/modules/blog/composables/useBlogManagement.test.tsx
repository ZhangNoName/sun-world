import { act, renderHook, waitFor } from '@testing-library/react'
import { fetchBlogCategories, fetchBlogPage, fetchBlogTags } from '../api'
import { useBlogManagement } from './useBlogManagement'

vi.mock('../api')

describe('useBlogManagement', () => {
  it('validates keyword and reloads requested pages with the active query', async () => {
    vi.mocked(fetchBlogCategories).mockResolvedValue([])
    vi.mocked(fetchBlogTags).mockResolvedValue([])
    vi.mocked(fetchBlogPage).mockResolvedValue({
      list: [],
      page: 1,
      page_size: 10,
      total: 0,
    })
    const { result } = renderHook(() => useBlogManagement())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => result.current.setKeyword('x'.repeat(31)))
    await act(() => result.current.submit())
    expect(result.current.validationMessage).toContain('30')

    act(() => result.current.setKeyword(' React '))
    await act(() => result.current.submit())
    await act(() => result.current.changePage(2))
    expect(fetchBlogPage).toHaveBeenLastCalledWith(2, 10, {
      keyword: 'React',
      sortBy: 'updated_at',
      sortOrder: 'desc',
    })
  })
})
