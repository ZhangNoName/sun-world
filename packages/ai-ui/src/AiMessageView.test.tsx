import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { AiMessageView } from './AiMessageView'
import type { AiUiMessage } from './types'

const message: AiUiMessage = {
  id: 'question',
  conversationId: 'chat',
  role: 'user',
  blocks: [{ type: 'text', text: 'Original question' }],
  status: 'completed',
}
const actions = { onEdit: vi.fn(), onRegenerate: vi.fn(), onFeedback: vi.fn() }

describe('AiMessageView', () => {
  it('disables editing an earlier user message during a run', () => {
    render(<AiMessageView message={message} busy {...actions} />)
    expect(screen.getByRole('button', { name: '编辑消息' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '复制消息' })).toBeEnabled()
  })

  it('replaces the thinking status with streamed text and shows actions after completion', () => {
    const assistant = { ...message, role: 'assistant' as const }
    const { rerender } = render(
      <AiMessageView
        message={{ ...assistant, blocks: [], status: 'streaming' }}
        busy
        {...actions}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent('正在思考…')
    expect(screen.getByText('0 秒')).toBeVisible()
    rerender(
      <AiMessageView
        message={{
          ...assistant,
          blocks: [{ type: 'text', text: '\n ' }],
          status: 'streaming',
        }}
        busy
        {...actions}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent('正在思考…')
    rerender(
      <AiMessageView
        message={{ ...assistant, status: 'streaming' }}
        busy
        {...actions}
      />
    )
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(
      screen.getByText('Original question').closest('[aria-busy]')
    ).toHaveAttribute('aria-busy', 'true')
    expect(
      screen.queryByRole('button', { name: '复制回答' })
    ).not.toBeInTheDocument()
    rerender(<AiMessageView message={assistant} {...actions} />)
    expect(screen.getByRole('button', { name: '重新生成' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '复制回答' })).toBeEnabled()
  })

  it('displays reported tokens and duration while permitting missing usage', () => {
    const assistant: AiUiMessage = { ...message, role: 'assistant' }
    const { rerender } = render(
      <AiMessageView
        message={{
          ...assistant,
          metrics: {
            durationMs: 2400,
            tokenUsage: {
              inputTokens: 1200,
              outputTokens: 34,
              totalTokens: 1234,
            },
          },
        }}
        {...actions}
      />
    )
    expect(screen.getByText('1,234 tokens')).toHaveAttribute(
      'title',
      '输入 1,200 · 输出 34'
    )
    expect(screen.getByText('2.4 秒')).toBeVisible()
    rerender(
      <AiMessageView
        message={{ ...assistant, metrics: { durationMs: 500 } }}
        {...actions}
      />
    )
    expect(screen.getByText('0.5 秒')).toBeVisible()
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument()
  })

  it.each([
    ['interrupted', '已停止'],
    ['failed', '生成失败'],
  ] as const)(
    'explains the %s state and permits regeneration',
    (status, label) => {
      render(
        <AiMessageView
          message={{ ...message, role: 'assistant', status }}
          {...actions}
        />
      )
      expect(screen.getByText(label)).toHaveAttribute('role', 'status')
      expect(screen.getByRole('button', { name: '重新生成' })).toBeEnabled()
    }
  )

  it('opens the latest message text and prevents saving an empty edit', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <AiMessageView message={message} {...actions} />
    )
    rerender(
      <AiMessageView
        message={{
          ...message,
          blocks: [{ type: 'text', text: 'Updated question' }],
        }}
        {...actions}
      />
    )
    await user.click(screen.getByRole('button', { name: '编辑消息' }))
    expect(screen.getByRole('textbox')).toHaveValue('Updated question')
    await user.clear(screen.getByRole('textbox'))
    expect(screen.getByRole('button', { name: '保存编辑' })).toBeDisabled()
  })
})
