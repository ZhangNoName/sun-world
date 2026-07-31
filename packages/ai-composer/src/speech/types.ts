export type SpeechPermission = 'granted' | 'prompt' | 'denied'

export type SpeechInputStatus =
  | 'unsupported'
  | 'checking'
  | 'ready'
  | 'listening'
  | 'denied'
  | 'error'

export type SpeechInputErrorCode =
  | 'permission-denied'
  | 'not-supported'
  | 'no-speech'
  | 'device-unavailable'
  | 'recognition-failed'

export interface SpeechRecognitionCallbacks {
  onInterim(transcript: string): void
  onFinal(transcript: string): void
  onError(code: SpeechInputErrorCode): void
  onEnd?(): void
}

export interface SpeechRecognitionSession {
  stop(): void
}

export interface SpeechInputAdapter {
  isSupported(): boolean
  checkPermission(): Promise<SpeechPermission>
  start(callbacks: SpeechRecognitionCallbacks): SpeechRecognitionSession
}
