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

  it('displays reported tokens and shows their details on hover', async () => {
    const user = userEvent.setup()
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
    const duration = screen.getByText('2.4 秒')
    const tokens = screen.getByText('1,234 tokens')
    expect(duration.nextElementSibling).toBe(tokens)
    const copyButton = screen.getByRole('button', { name: '复制回答' })
    await user.click(copyButton)
    expect(
      copyButton.querySelector('[data-icon-name="check"]')
    ).toBeInTheDocument()
    expect(screen.queryByText('已复制')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveClass('sr-only')
    await user.hover(tokens)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      '输入 1,200 · 输出 34'
    )
    expect(duration).toBeVisible()
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
    ['user', '发送时间'],
    ['assistant', '回复完成时间'],
  ] as const)('shows the %s timestamp on hover', async (role, label) => {
    const user = userEvent.setup()
    const createdAt = '2026-11-18T11:03:00Z'
    render(
      <AiMessageView message={{ ...message, role, createdAt }} {...actions} />
    )

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    await user.hover(screen.getByText('Original question'))
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(label)
    expect(tooltip.querySelector('time')).toHaveAttribute('datetime', createdAt)
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
