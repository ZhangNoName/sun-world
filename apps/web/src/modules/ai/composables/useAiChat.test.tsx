import { act, renderHook } from '@testing-library/react'
import { sendAiStreamMessage } from '../api'
import { useAiChat } from './useAiChat'

vi.mock('../api', () => ({
  sendAiStreamMessage: vi.fn(),
}))

const sendStream = vi.mocked(sendAiStreamMessage)

describe('useAiChat', () => {
  it('ignores empty prompts and appends streamed assistant content', async () => {
    sendStream.mockImplementation(async (_message, _sessionId, options) => {
      options.onMessage('你')
      options.onMessage('好')
      options.onComplete()
    })
    const { result } = renderHook(() => useAiChat())

    await act(() => result.current.sendMessage('   '))
    expect(sendStream).not.toHaveBeenCalled()

    await act(() => result.current.sendMessage('介绍太阳系'))
    expect(sendStream).toHaveBeenCalledWith(
      '介绍太阳系',
      'local-default',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(result.current.activeMessages).toMatchObject([
      { role: 'user', content: '介绍太阳系', status: 'done' },
      { role: 'assistant', content: '你好', status: 'done' },
    ])
    expect(result.current.activeConversation?.title).toBe('介绍太阳系')
  })

  it('aborts the active stream', async () => {
    let signal: AbortSignal | undefined
    sendStream.mockImplementation(
      async (_message, _sessionId, options) =>
        new Promise<void>((resolve) => {
          signal = options.signal
          signal?.addEventListener('abort', () => resolve())
        })
    )
    const { result } = renderHook(() => useAiChat())
    let pending: Promise<void>

    act(() => {
      pending = result.current.sendMessage('停止测试')
    })
    await act(async () => result.current.abort())
    expect(signal?.aborted).toBe(true)
    await act(async () => pending)
    expect(result.current.isSending).toBe(false)
  })
})
