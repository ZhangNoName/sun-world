import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiGet } from '@/shared/api'
import {
  clearDictionaryCache,
  fetchDictionary,
  invalidateDictionary,
} from './dictionaryRepository'

vi.mock('@/shared/api', () => ({
  apiGet: vi.fn(),
}))

describe('dictionaryRepository', () => {
  beforeEach(() => {
    clearDictionaryCache()
    vi.mocked(apiGet).mockReset()
  })

  it('deduplicates concurrent reads and caches the result', async () => {
    let resolveRequest!: (
      value: Array<{ value: string; label: string }>
    ) => void
    vi.mocked(apiGet).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve
      }) as never
    )

    const first = fetchDictionary('article-status')
    const second = fetchDictionary('article-status')
    resolveRequest([{ value: 'published', label: 'Published' }])

    await expect(Promise.all([first, second])).resolves.toEqual([
      [{ value: 'published', label: 'Published' }],
      [{ value: 'published', label: 'Published' }],
    ])
    expect(apiGet).toHaveBeenCalledTimes(1)
    await expect(fetchDictionary('article-status')).resolves.toEqual([
      { value: 'published', label: 'Published' },
    ])
    expect(apiGet).toHaveBeenCalledTimes(1)
  })

  it('invalidates only the requested dictionary code', async () => {
    vi.mocked(apiGet)
      .mockResolvedValueOnce([
        { value: 'published', label: 'Published' },
      ] as never)
      .mockResolvedValueOnce([{ value: 'draft', label: 'Draft' }] as never)
      .mockResolvedValueOnce([
        { value: 'published', label: 'Published again' },
      ] as never)

    await fetchDictionary('article-status')
    await fetchDictionary('visibility')
    invalidateDictionary('article-status')
    await fetchDictionary('article-status')
    await fetchDictionary('visibility')

    expect(apiGet).toHaveBeenCalledTimes(3)
  })
})
