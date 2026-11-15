import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ThemeProvider } from '@/shared/design/theme'
import { useBlogQa } from '../hooks/useBlogQa'
import { BlogQaPage } from './BlogQaPage'

vi.mock('../hooks/useBlogQa')
const mockedHook = vi.mocked(useBlogQa)
function renderPage() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <BlogQaPage />
      </ThemeProvider>
    </MemoryRouter>
  )
}
function state() {
  return {
    capabilities: {
      enabled: true,
      local_validation: true,
      dataset: '本地合成文章（3 篇）',
      model: '真实模型',
      authenticated: false,
    },
    user: null,
    run: null,
    busy: false,
    error: '',
    login: vi.fn(),
    logout: vi.fn(),
    send: vi.fn(),
    stop: vi.fn(),
    refresh: vi.fn(),
  }
}
describe('BlogQaPage', () => {
  it('requires the local test account before allowing a question', async () => {
    const value = state()
    mockedHook.mockReturnValue(value)
    renderPage()
    expect(screen.getByText('本地验证环境')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始提问' })).toBeDisabled()
    await userEvent.click(
      screen.getByRole('button', { name: '使用本地测试账号' })
    )
    expect(value.login).toHaveBeenCalledOnce()
  })
  it('renders answer content as text and uses server-owned citation links', () => {
    mockedHook.mockReturnValue({
      ...state(),
      user: { user_id: 1, display_name: '本地验证用户 1' },
      run: {
        id: 'r1',
        status: 'completed',
        question: '如何核对来源？',
        answer: '<script>untrusted</script>',
        sources: [
          { article_id: 1, title: '来源文章', url: '/aigc/blog-qa?article=1' },
        ],
      },
    })
    const { container } = renderPage()
    expect(screen.getByText('<script>untrusted</script>')).toBeInTheDocument()
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByRole('link', { name: '来源文章' })).toHaveAttribute(
      'href',
      '/aigc/blog-qa?article=1'
    )
  })
  it('uses normal site login and never exposes a synthetic account in site mode', () => {
    mockedHook.mockReturnValue({
      ...state(),
      capabilities: {
        ...state().capabilities,
        mode: 'site',
        local_validation: false,
      },
    })
    renderPage()
    expect(screen.getByRole('link', { name: '登录后提问' })).toHaveAttribute(
      'href',
      '/login?return_to=%2Faigc%2Fblog-qa'
    )
    expect(
      screen.queryByRole('button', { name: '使用本地测试账号' })
    ).not.toBeInTheDocument()
  })
  it('shows cancellation while work is active', async () => {
    const value = { ...state(), busy: true }
    mockedHook.mockReturnValue(value)
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: '停止回答' }))
    expect(value.stop).toHaveBeenCalledOnce()
  })
})
