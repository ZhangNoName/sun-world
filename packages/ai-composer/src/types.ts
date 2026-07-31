import type { Ref } from 'react'
import type { SpeechInputAdapter } from './speech/types'

export interface AiComposerModel {
  id: string
  label: string
  description?: string
  group?: string
  disabled?: boolean
}

export interface AiComposerCommand {
  id: string
  label: string
  description?: string
  keywords?: string[]
  shortcut?: string
  disabled?: boolean
}

export interface AiComposerSubmitPayload {
  markdown: string
  files: File[]
  modelId: string
  commandId?: string
}

export interface AiComposerSubmitOverrides {
  markdown?: string
  files?: File[]
  modelId?: string
  commandId?: string
}

export interface AiComposerHandle {
  focus(): void
  setQuestion(markdown: string): void
  submit(overrides?: AiComposerSubmitOverrides): Promise<boolean>
  cancel(): void
  reset(): void
}

export interface AiComposerProps {
  ref?: Ref<AiComposerHandle>
  value: string
  onValueChange(value: string): void
  models: AiComposerModel[]
  modelId: string
  onModelChange(modelId: string): void
  commands?: AiComposerCommand[]
  onSubmit(payload: AiComposerSubmitPayload): void | Promise<void>
  onCancel?(): void
  loading?: boolean
  disabled?: boolean
  placeholder?: string
  accept?: string
  maxFiles?: number
  maxFileSize?: number
  speechAdapter?: SpeechInputAdapter
}
