import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/modules/blog/ui/BlogHomeFeed', () => ({
  BlogHomeFeed: () => <div>feed</div>,
}))
vi.mock('@/modules/blog/composables/useBlogBaseData', () => ({
  useBlogBaseData: () => ({
    stats: {
      blog_count: 30,
      category_count: 5,
      tag_count: 26,
      total_view_num: 120,
    },
    loadBlogBaseData: vi.fn().mockResolvedValue(undefined),
  }),
}))

import { HomePage } from './HomePage'

describe('HomePage', () => {
  it('renders the required ICP filing link on the homepage', () => {
    render(<HomePage />)
    const links = screen.getAllByRole('link', { name: '豫ICP备2024081960号' })
    expect(links).toHaveLength(2)
    links.forEach((link) =>
      expect(link).toHaveAttribute('href', 'https://beian.miit.gov.cn/')
    )

    const privacyLinks = screen.getAllByRole('link', { name: '隐私政策' })
    expect(privacyLinks).toHaveLength(2)
    privacyLinks.forEach((link) =>
      expect(link).toHaveAttribute('href', '/privacy')
    )

    expect(
      screen.getAllByText(
        /Google 登录仅使用姓名、头像、已验证邮箱和账号标识来创建或登录 Sun World 账号，不用于广告或 AI 训练。/
      )
    ).toHaveLength(2)
  })

  it('exposes the profile metrics as a named four-column definition list', () => {
    render(<HomePage />)

    const metrics = screen.getByLabelText('站点统计')
    expect(metrics).toHaveClass('profile-metrics')
    expect(metrics.tagName).toBe('DL')
    expect(metrics.children).toHaveLength(4)
  })

  it('asks for consent before requesting location-based weather', () => {
    render(<HomePage />)

    expect(screen.getByRole('button', { name: 'weather.load' })).toBeVisible()
    expect(screen.queryByLabelText('weather.details')).not.toBeInTheDocument()
  })
})
