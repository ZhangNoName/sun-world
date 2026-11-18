import { MemoryRouter } from 'react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ThemeProvider } from '@/shared/design/theme'
import { AppPageContributions } from '@/app/extensions/AppPageContributions'
import { useAiChat } from '../composables/useAiChat'
import { AigcPage } from './AigcPage'

vi.mock('../composables/useAiChat')

describe('AigcPage', () => {
  it('renders the package-owned AI workspace', async () => {
    const user = userEvent.setup()
    const setReasoningEffort = vi.fn()
    vi.mocked(useAiChat).mockReturnValue({
      conversations: [],
      activeConversationId: 'chat-local-test',
      messages: [],
      runState: { status: 'idle' },
      providers: [
        { id: 'openai-guest', name: 'OpenAI', defaultModel: 'gpt-6.1-sol' },
      ],
      providerProfiles: [],
      reasoningEffort: 'medium',
      setReasoningEffort,
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
      <MemoryRouter>
        <ThemeProvider>
          <AppPageContributions>
            <AigcPage />
          </AppPageContributions>
        </ThemeProvider>
      </MemoryRouter>
    )

    expect(
      await screen.findByRole('link', { name: '博客问答' })
    ).toHaveAttribute('href', '/aigc/blog-qa')
    expect(
      screen.getByRole('region', { name: 'Sun World AI 工作区' })
    ).toBeInTheDocument()
    expect(screen.getByText('今天有什么计划？')).toBeInTheDocument()
    const reasoning = screen.getByRole('combobox', { name: '思考程度' })
    expect(reasoning).toHaveAttribute('data-slot', 'select-trigger')
    expect(reasoning).toHaveTextContent('思考：中')
    await user.click(reasoning)
    await user.click(await screen.findByRole('option', { name: '思考：高' }))
    expect(setReasoningEffort).toHaveBeenCalledWith('high')
    expect(screen.queryByRole('link', { name: '工作' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /登录/ })).toHaveAttribute(
      'href',
      '/login'
    )
    const themeSwitch = screen.getByRole('button', {
      name: /切换到(深色|浅色)模式/,
    })
    const previousTheme = document.documentElement.dataset.colorMode
    await user.click(themeSwitch)
    expect(document.documentElement.dataset.colorMode).toBe(
      previousTheme === 'dark' ? 'light' : 'dark'
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
