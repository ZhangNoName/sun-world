import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => (key === 'readMore' ? '阅读更多' : key),
  }),
}))
import { useBlogBaseData } from '../composables/useBlogBaseData'
import { useBlogList } from '../composables/useBlogList'
import type { BlogCardProps } from '../types'
import { BlogCard } from './BlogCard'
import { BlogHomeFeed } from './BlogHomeFeed'

vi.mock('../composables/useBlogBaseData')
vi.mock('../composables/useBlogList')

describe('BlogHomeFeed', () => {
  beforeEach(() => {
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
  })

  it('keeps toolbar controls named without visible field labels', () => {
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
    expect(screen.getByRole('combobox', { name: '排序方式' })).toBeVisible()
    expect(screen.queryByText('搜索博客', { selector: 'label' })).toBeNull()
    expect(screen.queryByText('排序方式', { selector: 'label' })).toBeNull()
  })

  it('keeps the article action accessible in the card trailing-action hook', () => {
    vi.mocked(useBlogList).mockReturnValue({
      items: [
        {
          id: 10,
          title: '图搜索入门',
          abstract: '图搜索训练可达性与层次关系。',
          publishTime: '2026-07-20',
          lastUpdateTime: '2026-07-20',
          tags: ['算法基础'],
          byteNum: 1024,
          commentNum: 2,
        },
      ],
      loading: false,
      total: 1,
      hasMore: false,
      keyword: '',
      sortBy: 'updated_at',
      sortOrder: 'desc',
      loadFirstPage: vi.fn().mockResolvedValue(undefined),
      loadMore: vi.fn().mockResolvedValue(undefined),
      updateQuery: vi.fn().mockResolvedValue(undefined),
    })

    render(
      <MemoryRouter>
        <BlogHomeFeed />
      </MemoryRouter>
    )

    const action = screen.getByRole('link', {
      name: '阅读更多: 图搜索入门',
    })
    expect(action).toHaveClass('z-blog-card__action')
    expect(action).toHaveAttribute('href', '/blog/10')
    expect(action.closest('article')).not.toHaveAttribute('role')
    expect(screen.queryByRole('button', { name: /阅读更多/ })).toBeNull()
  })
})

describe('BlogCard navigation semantics', () => {
  const item: BlogCardProps = {
    id: 10,
    title: '图搜索入门',
    abstract: '图搜索训练可达性与层次关系。',
    publishTime: '2026-07-20',
    lastUpdateTime: '2026-07-20',
    tags: ['算法基础'],
    byteNum: 1024,
    commentNum: 2,
  }

  it.each([
    ['click', async (link: HTMLElement) => userEvent.click(link)],
    [
      'Enter',
      async (link: HTMLElement) => {
        link.focus()
        await userEvent.keyboard('{Enter}')
      },
    ],
    [
      'Space',
      async (link: HTMLElement) => {
        link.focus()
        await userEvent.keyboard(' ')
      },
    ],
  ])('uses one link activation for %s', async (_method, activate) => {
    render(
      <MemoryRouter>
        <BlogCard {...item} />
      </MemoryRouter>
    )

    const link = screen.getByRole('link', {
      name: '阅读更多: 图搜索入门',
    })
    const clicks: Event[] = []
    const recordClick = (event: Event) => clicks.push(event)
    link.addEventListener('click', recordClick)

    await activate(link)

    expect(clicks).toHaveLength(1)
  })
})
