import { render, screen } from '@testing-library/react'

import { useBlogBaseData } from '../composables/useBlogBaseData'
import { useBlogList } from '../composables/useBlogList'
import { BlogHomeFeed } from './BlogHomeFeed'

vi.mock('../composables/useBlogBaseData')
vi.mock('../composables/useBlogList')

describe('BlogHomeFeed', () => {
  it('gives the blog search input an accessible label', () => {
    vi.mocked(useBlogBaseData).mockReturnValue({
      tagList: [],
      categoryList: [],
      stats: {
        blog_count: 0,
        category_count: 0,
        tag_count: 0,
        total_view_num: 0,
      },
      loading: false,
      loaded: false,
      loadBlogBaseData: vi.fn().mockResolvedValue(undefined),
    })
    vi.mocked(useBlogList).mockReturnValue({
      items: [],
      loading: false,
      total: 0,
      hasMore: false,
      keyword: '',
      sortBy: 'updated_at',
      sortOrder: 'desc',
      loadFirstPage: vi.fn().mockResolvedValue(undefined),
      loadMore: vi.fn().mockResolvedValue(undefined),
      updateQuery: vi.fn().mockResolvedValue(undefined),
    })

    render(<BlogHomeFeed />)

    expect(screen.getByRole('searchbox', { name: '搜索博客' })).toBeVisible()
  })
})
