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
  it('disables edits and regeneration while allowing copying during a run', () => {
    const { rerender } = render(
      <AiMessageView message={message} busy {...actions} />
    )
    expect(screen.getByRole('button', { name: '编辑消息' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '复制消息' })).toBeEnabled()
    rerender(
      <AiMessageView
        message={{ ...message, role: 'assistant', status: 'streaming' }}
        busy
        {...actions}
      />
    )
    expect(screen.getByRole('button', { name: '重新生成' })).toBeDisabled()
  })

  it.each([
    ['interrupted', '已停止 · 可重新生成'],
    ['failed', '生成失败 · 可重试'],
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
