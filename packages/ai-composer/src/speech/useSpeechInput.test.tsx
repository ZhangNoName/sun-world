import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type {
  SpeechInputAdapter,
  SpeechPermission,
  SpeechRecognitionCallbacks,
} from './types'
import { useSpeechInput } from './useSpeechInput'

function createAdapter({
  supported = true,
  permission = 'granted',
}: { supported?: boolean; permission?: SpeechPermission } = {}) {
  let callbacks: SpeechRecognitionCallbacks | undefined
  const stop = vi.fn()
  const adapter: SpeechInputAdapter = {
    isSupported: () => supported,
    checkPermission: vi.fn().mockResolvedValue(permission),
    start: vi.fn((nextCallbacks) => {
      callbacks = nextCallbacks
      return { stop }
    }),
  }
  return { adapter, stop, callbacks: () => callbacks }
}

function SpeechHarness({ adapter }: { adapter: SpeechInputAdapter }) {
  const [text, setText] = useState('')
  const speech = useSpeechInput({
    adapter,
    onFinalTranscript: (value) => setText((current) => `${current}${value}`),
  })
  return (
    <div>
      <output>{speech.status}</output>
      <span>{speech.interimTranscript}</span>
      <span>{text}</span>
      <button type="button" onClick={speech.toggle}>
        toggle
      </button>
      <button type="button" onClick={speech.stop}>
        stop
      </button>
    </div>
  )
}

describe('useSpeechInput', () => {
  it('reports unsupported and denied states without starting recognition', async () => {
    const user = userEvent.setup()
    const unsupported = createAdapter({ supported: false })
    const { rerender } = render(<SpeechHarness adapter={unsupported.adapter} />)
    expect(screen.getByText('unsupported')).toBeInTheDocument()

    const denied = createAdapter({ permission: 'denied' })
    rerender(<SpeechHarness adapter={denied.adapter} />)
    await user.click(screen.getByRole('button', { name: 'toggle' }))
    expect(await screen.findByText('denied')).toBeInTheDocument()
    expect(denied.adapter.start).not.toHaveBeenCalled()
  })

  it('publishes interim/final transcripts and stops its active session', async () => {
    const user = userEvent.setup()
    const speech = createAdapter()
    render(<SpeechHarness adapter={speech.adapter} />)
    await user.click(screen.getByRole('button', { name: 'toggle' }))
    expect(await screen.findByText('listening')).toBeInTheDocument()

    act(() => speech.callbacks()?.onInterim('draft words'))
    expect(screen.getByText('draft words')).toBeInTheDocument()
    act(() => speech.callbacks()?.onFinal('final words'))
    expect(screen.getByText('final words')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'stop' }))
    expect(speech.stop).toHaveBeenCalledTimes(1)
    expect(screen.getByText('ready')).toBeInTheDocument()
  })

  it('maps recognition errors and stops on unmount', async () => {
    const user = userEvent.setup()
    const speech = createAdapter()
    const { unmount } = render(<SpeechHarness adapter={speech.adapter} />)
    await user.click(screen.getByRole('button', { name: 'toggle' }))
    act(() => speech.callbacks()?.onError('no-speech'))
    expect(screen.getByText('error')).toBeInTheDocument()
    unmount()
    expect(speech.stop).toHaveBeenCalledTimes(1)
  })
})
