import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('@/modules/blog/ui/BlogHomeFeed', () => ({
  BlogHomeFeed: () => <div>feed</div>,
}))
vi.mock('@/modules/blog/ui/SelfInfoCard', () => ({
  SelfInfoCard: () => <div>profile</div>,
}))
vi.mock('../ui/WeatherCard', () => ({ WeatherCard: () => <div>weather</div> }))

import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('renders the required ICP filing link on the homepage', () => {
    render(<HomePage />)
    const links = screen.getAllByRole('link', { name: '豫ICP备2024081960号' })
    expect(links).toHaveLength(2)
    links.forEach((link) =>
      expect(link).toHaveAttribute('href', 'https://beian.miit.gov.cn/')
    )
  })
})
