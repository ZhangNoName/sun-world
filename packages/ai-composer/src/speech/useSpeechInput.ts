import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  SpeechInputAdapter,
  SpeechInputErrorCode,
  SpeechInputStatus,
  SpeechRecognitionSession,
} from './types'

interface UseSpeechInputOptions {
  adapter: SpeechInputAdapter
  onFinalTranscript(transcript: string): void
}

export function useSpeechInput({
  adapter,
  onFinalTranscript,
}: UseSpeechInputOptions) {
  const [status, setStatus] = useState<SpeechInputStatus>(() =>
    adapter.isSupported() ? 'ready' : 'unsupported'
  )
  const [interimTranscript, setInterimTranscript] = useState('')
  const [errorCode, setErrorCode] = useState<SpeechInputErrorCode>()
  const sessionRef = useRef<SpeechRecognitionSession | null>(null)
  const finalRef = useRef(onFinalTranscript)
  finalRef.current = onFinalTranscript

  const stop = useCallback(() => {
    sessionRef.current?.stop()
    sessionRef.current = null
    setInterimTranscript('')
    setStatus(adapter.isSupported() ? 'ready' : 'unsupported')
  }, [adapter])

  const toggle = useCallback(async () => {
    if (sessionRef.current) {
      stop()
      return
    }
    if (!adapter.isSupported()) {
      setErrorCode('not-supported')
      setStatus('unsupported')
      return
    }

    setStatus('checking')
    setErrorCode(undefined)
    const permission = await adapter.checkPermission()
    if (permission === 'denied') {
      setErrorCode('permission-denied')
      setStatus('denied')
      return
    }

    try {
      sessionRef.current = adapter.start({
        onInterim: setInterimTranscript,
        onFinal: (transcript) => {
          setInterimTranscript('')
          finalRef.current(transcript)
        },
        onError: (code) => {
          sessionRef.current?.stop()
          sessionRef.current = null
          setInterimTranscript('')
          setErrorCode(code)
          setStatus(code === 'permission-denied' ? 'denied' : 'error')
        },
        onEnd: () => {
          sessionRef.current = null
          setInterimTranscript('')
          setStatus('ready')
        },
      })
      setStatus('listening')
    } catch {
      setErrorCode('recognition-failed')
      setStatus('error')
    }
  }, [adapter, stop])

  useEffect(() => {
    sessionRef.current?.stop()
    sessionRef.current = null
    setInterimTranscript('')
    setErrorCode(undefined)
    setStatus(adapter.isSupported() ? 'ready' : 'unsupported')
    return () => {
      sessionRef.current?.stop()
      sessionRef.current = null
    }
  }, [adapter])

  return { status, interimTranscript, errorCode, toggle, stop }
}
