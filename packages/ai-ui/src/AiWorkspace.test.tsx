import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AiWorkspace } from './AiWorkspace'

const messages = [
  {
    id: 'user-1',
    conversationId: 'conv-1',
    role: 'user' as const,
    blocks: [{ type: 'text' as const, text: 'Original question' }],
    status: 'completed' as const,
  },
  {
    id: 'assistant-1',
    conversationId: 'conv-1',
    role: 'assistant' as const,
    blocks: [{ type: 'text' as const, text: 'Assistant answer' }],
    status: 'completed' as const,
  },
]

describe('AiWorkspace', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('exposes GPT-style message actions and inline editing', async () => {
    const user = userEvent.setup()
    const onEditMessage = vi.fn()
    const onRegenerate = vi.fn()
    const onFeedback = vi.fn()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    render(
      <AiWorkspace
        conversations={[{ id: 'conv-1', title: 'Chat' }]}
        activeConversationId="conv-1"
        messages={messages}
        runState={{ status: 'idle' }}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onEditMessage={onEditMessage}
        onRegenerate={onRegenerate}
        onFeedback={onFeedback}
      />
    )

    await user.click(screen.getByRole('button', { name: '复制回答' }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'Assistant answer'
    )

    await user.click(screen.getByRole('button', { name: '编辑消息' }))
    const editor = screen.getByRole('textbox', { name: '编辑消息内容' })
    await user.clear(editor)
    await user.type(editor, 'Edited question')
    await user.click(screen.getByRole('button', { name: '保存编辑' }))
    expect(onEditMessage).toHaveBeenCalledWith('user-1', 'Edited question')

    await user.click(screen.getByRole('button', { name: '重新生成' }))
    expect(onRegenerate).toHaveBeenCalledWith('assistant-1')
    await user.click(screen.getByRole('button', { name: '赞' }))
    expect(onFeedback).toHaveBeenCalledWith('assistant-1', 'like')
  })

  it('clears the provider key whenever settings reopen', async () => {
    const user = userEvent.setup()
    render(
      <AiWorkspace
        conversations={[]}
        messages={[]}
        runState={{ status: 'idle' }}
        providers={[
          {
            id: 'deepseek',
            name: 'DeepSeek',
            defaultBaseUrl: 'https://api.deepseek.com',
            defaultModel: 'deepseek-chat',
          },
        ]}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onFeedback={vi.fn()}
        onSaveProvider={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '模型设置' }))
    const key = screen.getByLabelText('API Key')
    await user.type(key, 'sk-browser-only')
    await user.click(screen.getByRole('button', { name: '关闭设置' }))
    await user.click(screen.getByRole('button', { name: '模型设置' }))
    expect(screen.getByLabelText('API Key')).toHaveValue('')
  })

  it('updates the provider defaults when a service provider is selected', async () => {
    const user = userEvent.setup()
    render(
      <AiWorkspace
        conversations={[]}
        messages={[]}
        runState={{ status: 'idle' }}
        providers={[
          {
            id: 'deepseek',
            name: 'DeepSeek',
            defaultBaseUrl: 'https://api.deepseek.com',
            defaultModel: 'deepseek-chat',
          },
          {
            id: 'openai',
            name: 'OpenAI',
            defaultBaseUrl: 'https://api.openai.com/v1',
            defaultModel: 'gpt-4.1-mini',
          },
        ]}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onFeedback={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '模型设置' }))
    await user.click(screen.getByRole('combobox', { name: '服务商' }))
    expect(screen.getByRole('dialog')).not.toContainElement(
      await screen.findByRole('listbox')
    )
    await user.click(await screen.findByRole('option', { name: /^OpenAI$/ }))

    expect(screen.getByLabelText('配置名称')).toHaveValue('OpenAI')
    expect(screen.getByLabelText('Base URL')).toHaveValue(
      'https://api.openai.com/v1'
    )
    expect(screen.getByLabelText('模型')).toHaveValue('gpt-4.1-mini')
  })

  it('closes provider settings after a successful save', async () => {
    const user = userEvent.setup()
    const onSaveProvider = vi.fn().mockResolvedValue(undefined)
    render(
      <AiWorkspace
        conversations={[]}
        messages={[]}
        runState={{ status: 'idle' }}
        providers={[
          {
            id: 'deepseek',
            name: 'DeepSeek',
            defaultBaseUrl: 'https://api.deepseek.com',
            defaultModel: 'deepseek-chat',
          },
        ]}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onFeedback={vi.fn()}
        onSaveProvider={onSaveProvider}
      />
    )

    await user.click(screen.getByRole('button', { name: /设置/ }))
    await user.click(screen.getByRole('button', { name: /保存配置/ }))

    await waitFor(() => expect(onSaveProvider).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    )
  })

  it('shows a provider save failure inside settings', async () => {
    const user = userEvent.setup()
    render(
      <AiWorkspace
        conversations={[]}
        messages={[]}
        runState={{ status: 'idle' }}
        providers={[
          {
            id: 'deepseek',
            name: 'DeepSeek',
            defaultBaseUrl: 'https://api.deepseek.com',
            defaultModel: 'deepseek-chat',
          },
        ]}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onFeedback={vi.fn()}
        onSaveProvider={vi.fn().mockRejectedValue(new Error('保存请求失败'))}
      />
    )

    await user.click(screen.getByRole('button', { name: /设置/ }))
    await user.click(screen.getByRole('button', { name: /保存配置/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('保存请求失败')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('resizes the conversation sidebar with pointer and keyboard input', () => {
    const onSidebarWidthChange = vi.fn()
    render(
      <AiWorkspace
        conversations={[]}
        messages={[]}
        runState={{ status: 'idle' }}
        sidebarWidth={288}
        onSidebarWidthChange={onSidebarWidthChange}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onFeedback={vi.fn()}
      />
    )

    const resizeHandle = screen.getByRole('separator', {
      name: '调整对话列表宽度',
    })
    fireEvent.pointerDown(resizeHandle, { clientX: 288, pointerId: 1 })
    fireEvent.pointerMove(resizeHandle, { clientX: 340, pointerId: 1 })
    fireEvent.pointerUp(resizeHandle, { pointerId: 1 })
    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(340)

    fireEvent.keyDown(resizeHandle, { key: 'ArrowLeft' })
    expect(onSidebarWidthChange).toHaveBeenLastCalledWith(324)
  })

  it('uses an explicit retry action and shows saved provider profiles', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(
      <AiWorkspace
        conversations={[]}
        messages={messages}
        runState={{
          status: 'error',
          code: 'AI_STREAM_INTERRUPTED',
          message: '连接中断',
          retryable: true,
        }}
        providerProfiles={[
          {
            id: 'profile-1',
            provider: 'deepseek',
            name: '我的 DeepSeek',
            baseUrl: 'https://api.deepseek.com',
            model: 'deepseek-chat',
            isDefault: true,
            hasApiKey: true,
            apiKeyHint: 'sk-••••1234',
          },
        ]}
        onRetry={onRetry}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onFeedback={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '模型设置' }))
    expect(screen.getByText('我的 DeepSeek')).toBeInTheDocument()
    expect(screen.getAllByText('deepseek-chat')).toHaveLength(2)
  })

  it('closes the mobile conversation drawer from its scrim', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const user = userEvent.setup()
    render(
      <AiWorkspace
        conversations={[]}
        messages={[]}
        runState={{ status: 'idle' }}
        providers={[
          {
            id: 'deepseek',
            name: 'DeepSeek',
            defaultBaseUrl: 'https://api.deepseek.com',
            defaultModel: 'deepseek-chat',
          },
        ]}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onFeedback={vi.fn()}
      />
    )

    await user.click(screen.getByRole('button', { name: '打开对话列表' }))
    await user.click(screen.getByRole('button', { name: '关闭对话列表遮罩' }))
    expect(
      screen.getByRole('button', { name: '打开对话列表' })
    ).toBeInTheDocument()
  })

  it('controls and clears the composer after sending', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(
      <AiWorkspace
        conversations={[]}
        messages={[]}
        runState={{ status: 'idle' }}
        providers={[
          {
            id: 'deepseek',
            name: 'DeepSeek',
            defaultBaseUrl: 'https://api.deepseek.com',
            defaultModel: 'deepseek-chat',
          },
        ]}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={onSend}
        onStop={vi.fn()}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onFeedback={vi.fn()}
      />
    )

    const composer = screen.getByRole('textbox', {
      name: '给 Sun World AI 发消息',
    })
    await user.type(composer, '  生成一张表  ')
    await user.click(screen.getByRole('button', { name: '发送消息' }))

    expect(onSend).toHaveBeenCalledWith({
      markdown: '生成一张表',
      files: [],
      modelId: 'provider:deepseek',
      commandId: undefined,
    })
    expect(composer).toHaveValue('')
  })

  it('maps provider profiles into selectable composer models', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn()
    render(
      <AiWorkspace
        conversations={[]}
        messages={[]}
        runState={{ status: 'idle' }}
        providers={[
          { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat' },
        ]}
        providerProfiles={[
          {
            id: 'profile-1',
            provider: 'deepseek',
            name: '我的推理模型',
            baseUrl: 'https://api.deepseek.com',
            model: 'deepseek-reasoner',
            isDefault: true,
            hasApiKey: true,
          },
        ]}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={onSend}
        onStop={vi.fn()}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onFeedback={vi.fn()}
      />
    )

    expect(
      screen.getByRole('button', { name: '选择模型，当前 deepseek-reasoner' })
    ).toBeInTheDocument()
    await user.type(
      screen.getByRole('textbox', { name: '给 Sun World AI 发消息' }),
      'reason'
    )
    await user.click(screen.getByRole('button', { name: '发送消息' }))
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'profile:profile-1' })
    )
  })

  it('shows the model provider as a compact option tag', async () => {
    const user = userEvent.setup()
    render(
      <AiWorkspace
        conversations={[]}
        messages={[]}
        runState={{ status: 'idle' }}
        providers={[
          { id: 'deepseek', name: 'DeepSeek', defaultModel: 'deepseek-chat' },
        ]}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onFeedback={vi.fn()}
      />
    )

    await user.click(
      screen.getByRole('button', { name: '选择模型，当前 deepseek-chat' })
    )
    const option = screen.getByRole('option', {
      name: 'deepseek-chat DeepSeek',
    })

    expect(within(option).getByText('DeepSeek')).toHaveClass(
      'sw-ai-model-provider-tag'
    )
  })

  it('delegates the loading composer stop action', async () => {
    const user = userEvent.setup()
    const onStop = vi.fn()
    render(
      <AiWorkspace
        conversations={[]}
        messages={[]}
        runState={{ status: 'running' }}
        onNewConversation={vi.fn()}
        onSelectConversation={vi.fn()}
        onSend={vi.fn()}
        onStop={onStop}
        onEditMessage={vi.fn()}
        onRegenerate={vi.fn()}
        onFeedback={vi.fn()}
      />
    )
    await user.click(screen.getByRole('button', { name: '停止生成' }))
    expect(onStop).toHaveBeenCalledTimes(1)
  })
})
