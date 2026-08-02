import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

import { BlogCard } from './BlogCard'

describe('BlogCard', () => {
  it('makes the whole card the direct detail link without a read-more action', () => {
    render(
      <MemoryRouter>
        <BlogCard
          id="39"
          title="Graph search"
          abstract="An introduction to graph search."
          publishTime="2026-06-20"
          lastUpdateTime="2026-06-20 23:33"
          tags={[]}
          byteNum={0}
          commentNum={0}
        />
      </MemoryRouter>
    )

    const card = screen.getByRole('link', { name: 'Graph search' })
    expect(card).toHaveClass('z-blog-card')
    expect(card).toHaveAttribute('href', '/blog/39')
    expect(screen.queryByText('阅读更多')).toBeNull()
  })

  it('renders the available last update time when the list API omits creation time', () => {
    render(
      <MemoryRouter>
        <BlogCard
          id="39"
          title="Graph search"
          abstract="An introduction to graph search."
          publishTime="-"
          lastUpdateTime="2026-06-20 23:33"
          tags={[]}
          byteNum={0}
          commentNum={0}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('2026-06-20 23:33')).toBeVisible()
    expect(screen.queryByText('-', { exact: true })).toBeNull()
  })
})
