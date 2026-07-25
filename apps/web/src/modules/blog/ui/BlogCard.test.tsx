import { render, screen } from '@testing-library/react'

import { BlogCard } from './BlogCard'

describe('BlogCard', () => {
  it('renders the available last update time when the list API omits creation time', () => {
    render(
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
    )

    expect(screen.getByText('2026-06-20 23:33')).toBeVisible()
    expect(screen.queryByText('-', { exact: true })).toBeNull()
  })
})
