import { render, screen } from '@testing-library/react'

import { useAiChat } from '../composables/useAiChat'
import { AigcPage } from './AigcPage'

vi.mock('../composables/useAiChat')

describe('AigcPage', () => {
  it('renders the package-owned AI workspace', () => {
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

    render(<AigcPage />)

    expect(
      screen.getByRole('region', { name: 'Sun World AI 工作区' })
    ).toBeInTheDocument()
    expect(screen.getByText('今天想一起完成什么？')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '模型设置' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /角色与 Skills 设置/ })
    ).toBeInTheDocument()
  })
})
