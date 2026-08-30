import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ThemeProvider } from '@/shared/design/theme'
import { useAiChat } from '../composables/useAiChat'
import { AigcPage } from './AigcPage'

vi.mock('../composables/useAiChat')

describe('AigcPage', () => {
  it('renders the package-owned AI workspace', async () => {
    const user = userEvent.setup()
    vi.mocked(useAiChat).mockReturnValue({
      conversations: [],
      activeConversationId: 'chat-local-test',
      messages: [],
      runState: { status: 'idle' },
      providers: [{ id: 'deepseek', name: 'DeepSeek' }],
      providerProfiles: [],
      personas: [],
      skills: [],
      selectedPersonaId: null,
      selectedSkillIds: [],
      capabilityStatus: 'guest',
      capabilityError: null,
      isAuthenticated: false,
      accountKey: null,
      startConversation: vi.fn(),
      selectConversation: vi.fn(),
      sendMessage: vi.fn(),
      stop: vi.fn(),
      editMessage: vi.fn(),
      regenerate: vi.fn(),
      retryLast: vi.fn(),
      setFeedback: vi.fn(),
      saveProvider: vi.fn(),
      selectPersona: vi.fn(),
      toggleSkill: vi.fn(),
      refreshCapabilities: vi.fn(),
      savePersona: vi.fn(),
      removePersona: vi.fn(),
      saveSkill: vi.fn(),
      removeSkill: vi.fn(),
    })

    render(
      <ThemeProvider>
        <AigcPage />
      </ThemeProvider>
    )

    expect(
      screen.getByRole('region', { name: 'Sun World AI 工作区' })
    ).toBeInTheDocument()
    expect(screen.getByText('今天有什么计划？')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /登录/ })).toHaveAttribute(
      'href',
      '/login'
    )
    await user.click(screen.getByRole('button', { name: '插件' }))
    expect(screen.getByRole('button', { name: '模型设置' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /角色与 Skills 设置/ })
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: '收起对话列表' }))
    expect(
      screen
        .getByRole('button', { name: '打开对话列表' })
        .querySelector('img[src="/logo.svg"]')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /切换到(深色|浅色)模式/ })
    ).toBeInTheDocument()
  })
})
