import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ThemeProvider } from '@/shared/design/theme'
import { useBlogQa } from '../hooks/useBlogQa'
import { BlogQaPage } from './BlogQaPage'
import {
  fetchLocalArticle,
  normalizeBlogQaRun,
  type BlogQaCapabilities,
} from '../blog-qa-api'
import formalContract from '../fixtures/formal-contract.json'

vi.mock('../hooks/useBlogQa')
vi.mock('../blog-qa-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../blog-qa-api')>()),
  fetchLocalArticle: vi.fn(),
}))
const mockedHook = vi.mocked(useBlogQa)
function renderPage(entry = '/aigc/blog-qa') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
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
    canDeleteHistory: false,
    historyDeletionStatus: 'idle' as const,
    error: '',
    login: vi.fn(),
    logout: vi.fn(),
    send: vi.fn(),
    stop: vi.fn(),
    refresh: vi.fn(),
    deleteHistory: vi.fn(),
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
  it('offers normal login and public examples for the formal API', () => {
    mockedHook.mockReturnValue({
      ...state(),
      capabilities: {
        ...state().capabilities,
        mode: 'formal',
        local_validation: false,
      },
    })
    renderPage()
    expect(screen.getByRole('link', { name: '登录后提问' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '文章中如何处理权限与账号？' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '使用本地测试账号' })
    ).not.toBeInTheDocument()
  })
  it.each(formalContract.cases)(
    'renders the actual formal $case contract with safe sources and account copy',
    (record) => {
      const run = normalizeBlogQaRun(record.get.body.data)
      mockedHook.mockReturnValue({
        ...state(),
        user: { user_id: 7, display_name: '站点账号' },
        capabilities: record.capabilities.body.data as BlogQaCapabilities,
        run,
      })
      renderPage('/aigc/blog-qa?article=1')
      expect(screen.getByText(run.question)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: '退出登录' })
      ).toBeInTheDocument()
      expect(screen.queryByText('本地验证环境')).not.toBeInTheDocument()
      expect(fetchLocalArticle).not.toHaveBeenCalled()
      if (record.case === 'completed') {
        expect(screen.getByText(run.answer!)).toBeInTheDocument()
        expect(screen.getByRole('link', { name: '权限检查' })).toHaveAttribute(
          'href',
          '/blog/1'
        )
      } else {
        expect(
          screen.getByText('本次问答已取消，可以重新提问')
        ).toBeInTheDocument()
        expect(
          screen.queryByText('AGENT_RUN_CANCELLED')
        ).not.toBeInTheDocument()
      }
    }
  )
  it('shows an actionable formal authorization error and keeps submission disabled', async () => {
    const value = state()
    mockedHook.mockReturnValue({
      ...value,
      capabilities: {
        ...formalContract.cases[0].anonymous_capabilities.body.data,
        reason: 'AGENT_NOT_ALLOWLISTED',
      } as BlogQaCapabilities,
    })
    renderPage()
    expect(
      screen.getByText('当前账号尚未获得博客问答权限，请联系管理员')
    ).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('你想了解什么？'), '公开问题')
    expect(screen.getByRole('button', { name: '开始提问' })).toBeDisabled()
    expect(value.send).not.toHaveBeenCalled()
  })
  it('requires confirmation before deleting the displayed formal result', async () => {
    const record = formalContract.cases[0]
    const value = {
      ...state(),
      capabilities: record.capabilities.body.data as BlogQaCapabilities,
      user: { user_id: 7, display_name: '站点账号' },
      run: normalizeBlogQaRun(record.get.body.data),
      canDeleteHistory: true,
    }
    mockedHook.mockReturnValue(value)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    try {
      renderPage()
      const button = screen.getByRole('button', { name: '删除此问答' })
      await userEvent.click(button)
      expect(confirm).toHaveBeenCalledWith(
        expect.stringContaining('从历史中移除')
      )
      expect(value.deleteHistory).not.toHaveBeenCalled()
      expect(screen.getByText(value.run.question)).toBeInTheDocument()
      confirm.mockReturnValue(true)
      await userEvent.click(button)
      expect(value.deleteHistory).toHaveBeenCalledOnce()
      expect(value.deleteHistory).toHaveBeenCalledWith(value.run.id)
    } finally {
      confirm.mockRestore()
    }
  })
  it('keeps the answer visible and disables run controls while deleting', () => {
    const record = formalContract.cases[0]
    const run = normalizeBlogQaRun(record.get.body.data)
    mockedHook.mockReturnValue({
      ...state(),
      capabilities: record.capabilities.body.data as BlogQaCapabilities,
      user: { user_id: 7, display_name: '站点账号' },
      run,
      canDeleteHistory: true,
      historyDeletionStatus: 'pending',
    })
    renderPage()
    expect(screen.getByText(run.answer!)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '正在删除…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '刷新状态' })).toBeDisabled()
    expect(screen.getByLabelText('你想了解什么？')).toBeDisabled()
  })
})
