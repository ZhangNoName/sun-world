import { useRef, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  AiComposer,
  AiComposerSubmitError,
  type AiComposerHandle,
  type AiComposerProps,
} from './index'
import type {
  SpeechInputAdapter,
  SpeechRecognitionCallbacks,
} from './speech/types'

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
  commands,
  accept,
  maxFiles,
  maxFileSize,
  speechAdapter,
}: {
  onSubmit?: AiComposerProps['onSubmit']
  onCancel?: AiComposerProps['onCancel']
  modelId?: string
  disabled?: boolean
  composerRef?: React.RefObject<AiComposerHandle | null>
  commands?: AiComposerProps['commands']
  accept?: string
  maxFiles?: number
  maxFileSize?: number
  speechAdapter?: SpeechInputAdapter
}) {
  const [value, setValue] = useState('')
  const [selectedModelId, setSelectedModelId] = useState(modelId)
  return (
    <AiComposer
      ref={composerRef}
      value={value}
      onValueChange={setValue}
      models={models}
      modelId={selectedModelId}
      onModelChange={setSelectedModelId}
      commands={commands}
      onSubmit={onSubmit}
      onCancel={onCancel}
      disabled={disabled}
      placeholder="消息"
      accept={accept}
      maxFiles={maxFiles}
      maxFileSize={maxFileSize}
      speechAdapter={speechAdapter}
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

  it('shows an explicitly safe host submission error', async () => {
    const user = userEvent.setup()
    render(
      <ComposerHarness
        onSubmit={() =>
          Promise.reject(
            new AiComposerSubmitError('当前服务暂不支持附件，请移除后重试。')
          )
        }
      />
    )
    await user.type(screen.getByRole('textbox', { name: '消息' }), 'question')
    await user.click(screen.getByRole('button', { name: '发送消息' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      '当前服务暂不支持附件，请移除后重试。'
    )
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
      ref.current?.submit({
        markdown: 'external question',
        modelId: 'deepseek',
      })
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

  it('selects, submits, and removes original File attachments', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const attachment = new File(['hello'], 'notes.md', {
      type: 'text/markdown',
      lastModified: 10,
    })
    render(
      <ComposerHarness
        onSubmit={onSubmit}
        accept=".md"
        maxFiles={2}
        maxFileSize={20}
      />
    )

    await user.upload(screen.getByLabelText('添加附件'), attachment)
    expect(screen.getByText('notes.md')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '消息' }), 'read it')
    await user.click(screen.getByRole('button', { name: '发送消息' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ files: [attachment] })
    )
    expect(screen.queryByText('notes.md')).not.toBeInTheDocument()

    await user.upload(screen.getByLabelText('添加附件'), attachment)
    await user.click(screen.getByRole('button', { name: '移除 notes.md' }))
    expect(screen.queryByText('notes.md')).not.toBeInTheDocument()
  })

  it('shows a temporary notice for a duplicate attachment', async () => {
    vi.useFakeTimers()
    const attachment = new File(['hello'], 'notes.md', {
      type: 'text/markdown',
      lastModified: 10,
    })

    try {
      render(<ComposerHarness accept=".md" />)
      const input = screen.getByLabelText(/添加附件/)

      fireEvent.change(input, { target: { files: [attachment] } })
      fireEvent.change(input, { target: { files: [attachment] } })

      expect(screen.getAllByText('notes.md')).toHaveLength(1)
      expect(screen.getByRole('status')).toHaveTextContent('重复文件：notes.md')

      act(() => vi.advanceTimersByTime(2500))
      expect(screen.queryByText('重复文件：notes.md')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('switches the controlled model and submits its id', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<ComposerHarness onSubmit={onSubmit} />)

    await user.click(
      screen.getByRole('button', { name: '选择模型，当前 DeepSeek' })
    )
    await user.click(screen.getByRole('option', { name: 'Disabled' }))
    expect(
      screen.getByRole('button', { name: '选择模型，当前 DeepSeek' })
    ).toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: 'DeepSeek' }))
    await user.type(screen.getByRole('textbox', { name: '消息' }), 'model')
    await user.click(screen.getByRole('button', { name: '发送消息' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: 'deepseek' })
    )
  })

  it('returns focus to the model trigger after choosing an option', async () => {
    const user = userEvent.setup()
    render(<ComposerHarness />)
    const trigger = screen.getByRole('button', {
      name: '选择模型，当前 DeepSeek',
    })
    await user.click(trigger)
    await user.click(screen.getByRole('option', { name: 'DeepSeek' }))
    expect(trigger).toHaveFocus()
  })

  it('closes the model selector when the user clicks outside it', async () => {
    const user = userEvent.setup()
    render(<ComposerHarness />)

    await user.click(screen.getByRole('button', { name: /DeepSeek/ }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()

    await user.click(screen.getByRole('textbox'))

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes the model selector with Escape and restores trigger focus', async () => {
    const user = userEvent.setup()
    render(<ComposerHarness />)
    const trigger = screen.getByRole('button', { name: /DeepSeek/ })

    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('selects a slash command with the keyboard and submits a structured id', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <ComposerHarness
        onSubmit={onSubmit}
        commands={[
          {
            id: 'visualize',
            label: 'Accessibility Visualization',
            description: 'Make charts inclusive',
          },
          { id: 'icons', label: 'Adding Sun World Icons' },
        ]}
      />
    )
    const textbox = screen.getByRole('textbox', { name: '消息' })

    await user.type(textbox, '/access')
    expect(screen.getByRole('listbox', { name: '命令' })).toBeInTheDocument()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByText('Accessibility Visualization')).toBeInTheDocument()
    expect(textbox).toHaveValue('')

    await user.type(textbox, 'create a chart')
    await user.click(screen.getByRole('button', { name: '发送消息' }))
    expect(onSubmit).toHaveBeenCalledWith({
      markdown: 'create a chart',
      files: [],
      modelId: 'deepseek',
      commandId: 'visualize',
    })
  })

  it('closes the command palette with Escape and removes a selected command', async () => {
    const user = userEvent.setup()
    render(
      <ComposerHarness
        commands={[{ id: 'icons', label: 'Adding Sun World Icons' }]}
      />
    )
    const textbox = screen.getByRole('textbox', { name: '消息' })
    await user.type(textbox, '/')
    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('listbox', { name: '命令' })
    ).not.toBeInTheDocument()

    await user.clear(textbox)
    await user.type(textbox, '/icons')
    await user.keyboard('{Enter}')
    await user.click(
      screen.getByRole('button', { name: '移除命令 Adding Sun World Icons' })
    )
    expect(screen.queryByText('Adding Sun World Icons')).not.toBeInTheDocument()
  })

  it('keeps Markdown as source text without an inline preview control', async () => {
    const user = userEvent.setup()
    render(<ComposerHarness />)
    const textbox = screen.getByRole('textbox', { name: '消息' })

    await user.type(textbox, '# 标题')

    expect(textbox).toHaveValue('# 标题')
    expect(
      screen.queryByRole('button', { name: '预览 Markdown' })
    ).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Markdown 预览')).not.toBeInTheDocument()
  })

  it('appends browser speech and stops recognition when cancelled', async () => {
    const user = userEvent.setup()
    let callbacks: SpeechRecognitionCallbacks | undefined
    const stop = vi.fn()
    const adapter: SpeechInputAdapter = {
      isSupported: () => true,
      checkPermission: vi.fn().mockResolvedValue('granted'),
      start: vi.fn((value) => {
        callbacks = value
        return { stop }
      }),
    }
    render(<ComposerHarness speechAdapter={adapter} onCancel={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '开始语音输入' }))
    expect(
      await screen.findByRole('button', { name: '停止语音输入' })
    ).toBeInTheDocument()
    act(() => callbacks?.onInterim('临时文本'))
    expect(screen.getByText('临时文本')).toBeInTheDocument()
    act(() => callbacks?.onFinal('最终文本'))
    expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue(
      '最终文本'
    )

    await user.click(screen.getByRole('button', { name: '停止语音输入' }))
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
