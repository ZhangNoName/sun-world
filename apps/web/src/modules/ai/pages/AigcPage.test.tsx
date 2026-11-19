import { MemoryRouter } from 'react-router'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ThemeProvider } from '@/shared/design/theme'
import { AppPageContributions } from '@/app/extensions/AppPageContributions'
import { useAiChat } from '../composables/useAiChat'
import { AigcPage } from './AigcPage'

vi.mock('../composables/useAiChat')

function chatFixture(
  overrides: Partial<ReturnType<typeof useAiChat>> = {}
): ReturnType<typeof useAiChat> {
  return {
    conversations: [],
    activeConversationId: 'chat-local-test',
    messages: [],
    runState: { status: 'idle' },
    providers: [
      { id: 'openai-guest', name: 'OpenAI', defaultModel: 'gpt-6.1-sol' },
    ],
    providerProfiles: [],
    reasoningEffort: 'medium',
    setReasoningEffort: vi.fn(),
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
    ...overrides,
  }
}

describe('AigcPage', () => {
  it('renders the package-owned AI workspace', async () => {
    const user = userEvent.setup()
    const setReasoningEffort = vi.fn()
    vi.mocked(useAiChat).mockReturnValue(chatFixture({ setReasoningEffort }))

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
    const reasoning = screen.getByRole('button', {
      name: '模型与思考程度，GPT-6.1 Sol，中',
    })
    expect(reasoning).toHaveAttribute('aria-haspopup', 'menu')
    expect(reasoning).toHaveTextContent('GPT-6.1 Sol')
    await user.click(reasoning)
    expect(
      await screen.findByRole('menuitemradio', { name: '中' })
    ).toHaveAttribute('aria-checked', 'true')
    const selectModel = await screen.findByRole('menuitem', {
      name: '选择模型，当前 GPT-6.1 Sol',
    })
    await user.click(selectModel)
    const availableModel = await screen.findByRole('menuitemradio', {
      name: /GPT-6.1 Sol/,
    })
    expect(availableModel).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(1)
    await user.click(screen.getByRole('menuitem', { name: '返回思考程度' }))
    expect(
      await screen.findByRole('menuitemradio', { name: '中' })
    ).toBeVisible()
    await user.click(screen.getByRole('menuitemradio', { name: '高' }))
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
  it('sends with the chosen account model even when a saved profile is the default', async () => {
    const user = userEvent.setup()
    const sendMessage = vi.fn()
    vi.mocked(useAiChat).mockReturnValue(
      chatFixture({
        isAuthenticated: true,
        sendMessage,
        providers: [
          {
            id: 'qwen',
            name: 'Qwen',
            defaultModel: 'qwen3.5',
            isDefault: true,
          },
        ],
        providerProfiles: [
          {
            id: 'personal',
            name: '我的模型',
            provider: 'deepseek',
            baseUrl: 'https://api.deepseek.com',
            model: 'deepseek-chat',
            isDefault: true,
            hasApiKey: true,
          },
        ],
      })
    )
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AppPageContributions>
            <AigcPage />
          </AppPageContributions>
        </ThemeProvider>
      </MemoryRouter>
    )

    await user.click(
      screen.getByRole('button', { name: '选择模型，当前 deepseek-chat' })
    )
    expect(
      await screen.findByRole('menuitemradio', { name: /deepseek-chat/ })
    ).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('menuitemradio', { name: /qwen3.5/i }))
    expect(
      screen.getByRole('button', { name: '选择模型，当前 qwen3.5' })
    ).toBeVisible()
    await user.type(
      screen.getByRole('textbox', { name: '询问 Sun World AI' }),
      '你好'
    )
    await user.click(screen.getByRole('button', { name: '发送消息' }))

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: '你好', modelId: 'model:qwen' })
    )
  })
})
