import type {
  SpeechInputAdapter,
  SpeechInputErrorCode,
  SpeechRecognitionCallbacks,
} from './types'

interface BrowserSpeechRecognitionResult {
  isFinal: boolean
  0?: { transcript?: string }
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number
  results: ArrayLike<BrowserSpeechRecognitionResult>
}

interface BrowserSpeechRecognition {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

function recognitionConstructor() {
  const speechWindow = window as typeof window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
}

export function createBrowserSpeechAdapter(): SpeechInputAdapter {
  return {
    isSupported: () =>
      typeof window !== 'undefined' &&
      window.isSecureContext !== false &&
      Boolean(recognitionConstructor()),
    checkPermission: async () => {
      if (!navigator.permissions?.query) return 'prompt'
      try {
        const permission = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        })
        return permission.state
      } catch {
        return 'prompt'
      }
    },
    start: (callbacks) => startRecognition(callbacks),
  }
}

function startRecognition(callbacks: SpeechRecognitionCallbacks) {
  const Recognition = recognitionConstructor()
  if (!Recognition) throw new Error('Speech recognition is unavailable')
  const recognition = new Recognition()
  recognition.continuous = true
  recognition.interimResults = true
  recognition.lang = 'zh-CN'
  recognition.onresult = (event) => {
    let interim = ''
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index]
      const transcript = result?.[0]?.transcript?.trim()
      if (!transcript) continue
      if (result.isFinal) callbacks.onFinal(transcript)
      else interim += `${interim ? ' ' : ''}${transcript}`
    }
    callbacks.onInterim(interim)
  }
  recognition.onerror = (event) => callbacks.onError(mapError(event.error))
  recognition.onend = () => callbacks.onEnd?.()
  recognition.start()
  return { stop: () => recognition.stop() }
}

function mapError(value?: string): SpeechInputErrorCode {
  if (value === 'not-allowed' || value === 'service-not-allowed') {
    return 'permission-denied'
  }
  if (value === 'no-speech') return 'no-speech'
  if (value === 'audio-capture') return 'device-unavailable'
  return 'recognition-failed'
}
