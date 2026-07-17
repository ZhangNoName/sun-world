import { fireEvent, render, screen } from '@testing-library/react'

import { useAiChat } from '../composables/useAiChat'
import { AigcPage } from './AigcPage'

vi.mock('../composables/useAiChat')

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number

  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init)
    this.pointerId = init.pointerId
  }
}

describe('AigcPage sidebar resize', () => {
  beforeEach(() => {
    vi.mocked(useAiChat).mockReturnValue({
      conversations: [],
      activeConversationId: 'local-default',
      activeConversation: undefined,
      activeMessages: [],
      isSending: false,
      errorMessage: '',
      startConversation: vi.fn(),
      selectConversation: vi.fn(),
      sendMessage: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    })
  })

  it('owns drag listeners through pointer capture instead of window', () => {
    const add = vi.spyOn(window, 'addEventListener')
    render(<AigcPage />)
    const handle = screen.getByRole('button', {
      name: '调整侧边栏宽度',
    })
    const setPointerCapture = vi.fn()
    const releasePointerCapture = vi.fn()
    Object.assign(handle, { setPointerCapture, releasePointerCapture })

    fireEvent(
      handle,
      new TestPointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 7,
        clientX: 288,
      })
    )
    fireEvent(
      handle,
      new TestPointerEvent('pointermove', {
        bubbles: true,
        pointerId: 7,
        clientX: 320,
      })
    )
    fireEvent(
      handle,
      new TestPointerEvent('pointercancel', {
        bubbles: true,
        pointerId: 7,
      })
    )

    expect(setPointerCapture).toHaveBeenCalledWith(7)
    expect(releasePointerCapture).toHaveBeenCalledWith(7)
    expect(add).not.toHaveBeenCalledWith('pointermove', expect.any(Function))
    expect(add).not.toHaveBeenCalledWith('pointerup', expect.any(Function))
  })

  it('renders when sidebar storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })

    expect(() => render(<AigcPage />)).not.toThrow()
  })
})
