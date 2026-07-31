import { useRef, useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  AiComposer,
  type AiComposerHandle,
  type AiComposerProps,
} from './index'

const models = [
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'disabled', label: 'Disabled', disabled: true },
]

function ComposerHarness({
  onSubmit = vi.fn().mockResolvedValue(undefined),
  onCancel,
  modelId = 'deepseek',
  disabled,
  composerRef,
}: {
  onSubmit?: AiComposerProps['onSubmit']
  onCancel?: AiComposerProps['onCancel']
  modelId?: string
  disabled?: boolean
  composerRef?: React.RefObject<AiComposerHandle | null>
}) {
  const [value, setValue] = useState('')
  return (
    <AiComposer
      ref={composerRef}
      value={value}
      onValueChange={setValue}
      models={models}
      modelId={modelId}
      onModelChange={vi.fn()}
      onSubmit={onSubmit}
      onCancel={onCancel}
      disabled={disabled}
      placeholder="消息"
    />
  )
}

describe('AiComposer core', () => {
  it('submits trimmed markdown and clears only after success', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ComposerHarness onSubmit={onSubmit} />)

    await user.type(screen.getByRole('textbox', { name: '消息' }), '  hello  ')
    await user.click(screen.getByRole('button', { name: '发送消息' }))

    expect(onSubmit).toHaveBeenCalledWith({
      markdown: 'hello',
      files: [],
      modelId: 'deepseek',
      commandId: undefined,
    })
    expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue('')
  })

  it('keeps the draft and shows a safe message when submission rejects', async () => {
    const user = userEvent.setup()
    render(
      <ComposerHarness
        onSubmit={() => Promise.reject(new Error('secret backend response'))}
      />
    )

    await user.type(screen.getByRole('textbox', { name: '消息' }), 'keep me')
    await user.click(screen.getByRole('button', { name: '发送消息' }))

    expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue('keep me')
    expect(screen.getByRole('alert')).toHaveTextContent('发送失败，请重试。')
    expect(screen.getByRole('alert')).not.toHaveTextContent('secret')
  })

  it('silently disables submission for empty, disabled, and unavailable model states', () => {
    const { rerender } = render(<ComposerHarness />)
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    rerender(<ComposerHarness disabled />)
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled()

    rerender(<ComposerHarness modelId="disabled" />)
    expect(screen.getByRole('button', { name: '发送消息' })).toBeDisabled()
  })

  it('uses Enter to submit and Shift+Enter to insert a newline', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ComposerHarness onSubmit={onSubmit} />)
    const textbox = screen.getByRole('textbox', { name: '消息' })

    await user.type(textbox, 'line one{shift>}{enter}{/shift}line two')
    expect(textbox).toHaveValue('line one\nline two')
    expect(onSubmit).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('prevents duplicate submission while the first promise is pending', async () => {
    const user = userEvent.setup()
    let resolveSubmit: (() => void) | undefined
    const onSubmit = vi.fn(
      () => new Promise<void>((resolve) => (resolveSubmit = resolve))
    )
    render(<ComposerHarness onSubmit={onSubmit} />)
    await user.type(screen.getByRole('textbox', { name: '消息' }), 'once')

    await user.click(screen.getByRole('button', { name: '发送消息' }))
    await user.keyboard('{Enter}')
    expect(onSubmit).toHaveBeenCalledTimes(1)

    await act(async () => resolveSubmit?.())
  })

  it('exposes focus, setQuestion, submit overrides, cancel, and reset', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()
    const ref = { current: null } as React.RefObject<AiComposerHandle | null>
    render(
      <ComposerHarness
        composerRef={ref}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />
    )

    act(() => ref.current?.setQuestion('draft question'))
    expect(screen.getByRole('textbox', { name: '消息' })).toHaveFocus()
    expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue(
      'draft question'
    )

    await act(() =>
      ref.current?.submit({ markdown: 'external question', modelId: 'deepseek' })
    )
    expect(onSubmit).toHaveBeenLastCalledWith({
      markdown: 'external question',
      files: [],
      modelId: 'deepseek',
      commandId: undefined,
    })

    act(() => ref.current?.cancel())
    expect(onCancel).toHaveBeenCalledTimes(1)

    act(() => ref.current?.setQuestion('reset me'))
    act(() => ref.current?.reset())
    expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue('')
  })
})
