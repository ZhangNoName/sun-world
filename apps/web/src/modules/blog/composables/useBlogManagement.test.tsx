import { act, renderHook, waitFor } from '@testing-library/react'
import { fetchBlogCategories, fetchBlogPage, fetchBlogTags } from '../api'
import { useBlogManagement } from './useBlogManagement'

vi.mock('../api')

type BlogPageResponse = Awaited<ReturnType<typeof fetchBlogPage>>

function pageResponse(page: number): BlogPageResponse {
  return { list: [], page, page_size: 10, total: page }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

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

  it('loads metadata once and performs exactly one request per submit', async () => {
    vi.mocked(fetchBlogCategories).mockResolvedValue([])
    vi.mocked(fetchBlogTags).mockResolvedValue([])
    vi.mocked(fetchBlogPage).mockResolvedValue(pageResponse(1))
    const { result } = renderHook(() => useBlogManagement())
    await waitFor(() => expect(fetchBlogPage).toHaveBeenCalledTimes(1))

    act(() => result.current.setKeyword('React'))
    await act(() => result.current.submit())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetchBlogPage).toHaveBeenCalledTimes(2)
    expect(fetchBlogCategories).toHaveBeenCalledTimes(1)
    expect(fetchBlogTags).toHaveBeenCalledTimes(1)
  })

  it('keeps the latest page when requests resolve out of order', async () => {
    vi.mocked(fetchBlogCategories).mockResolvedValue([])
    vi.mocked(fetchBlogTags).mockResolvedValue([])
    const first = deferred<BlogPageResponse>()
    const second = deferred<BlogPageResponse>()
    vi.mocked(fetchBlogPage)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const { result } = renderHook(() => useBlogManagement())
    await waitFor(() => expect(fetchBlogPage).toHaveBeenCalledTimes(1))

    act(() => {
      void result.current.changePage(2)
    })
    await waitFor(() => expect(fetchBlogPage).toHaveBeenCalledTimes(2))
    await act(() => {
      second.resolve(pageResponse(2))
      return second.promise
    })
    await act(() => {
      first.resolve(pageResponse(1))
      return first.promise
    })

    expect(result.current.page).toBe(2)
    expect(result.current.total).toBe(2)
  })
})
