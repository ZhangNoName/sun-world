import {
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import '../../styles/base.css'
import './chat-composer.css'

export interface SunChatComposerProps {
  value?: string
  onValueChange?: (value: string) => void
  onSubmit?: (value: string) => void
  placeholder?: string
  loading?: boolean
  disabled?: boolean
  clearOnSubmit?: boolean
  submitLabel?: string
  leading?: ReactNode
  trailing?: ReactNode
  submitContent?: ReactNode
}

export function SunChatComposer({
  value = '',
  onValueChange,
  onSubmit,
  placeholder = '',
  loading = false,
  disabled = false,
  clearOnSubmit = true,
  submitLabel = 'Send',
  leading,
  trailing,
  submitContent,
}: SunChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isDisabled = disabled || loading
  const canSubmit = value.trim().length > 0 && !isDisabled
  const resize = () => {
    const target = textareaRef.current
    if (!target) return
    target.style.height = 'auto'
    target.style.height = `${Math.min(target.scrollHeight, 180)}px`
  }
  useEffect(resize, [value])
  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (!canSubmit) return
    onSubmit?.(value.trim())
    if (clearOnSubmit) onValueChange?.('')
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    submit()
  }
  return (
    <form className="sun-chat-composer" onSubmit={submit}>
      {leading ? (
        <div className="sun-chat-composer__leading">{leading}</div>
      ) : null}
      <textarea
        ref={textareaRef}
        className="sun-chat-composer__input"
        rows={1}
        value={value}
        placeholder={placeholder}
        disabled={isDisabled}
        aria-label={placeholder || 'Message'}
        onChange={(event) => onValueChange?.(event.target.value)}
        onInput={resize}
        onKeyDown={handleKeyDown}
      />
      {trailing ? (
        <div className="sun-chat-composer__trailing">{trailing}</div>
      ) : null}
      <button
        className="sun-chat-composer__submit"
        type="submit"
        disabled={!canSubmit}
        aria-label={submitLabel}
      >
        {submitContent ?? (loading ? '…' : submitLabel)}
      </button>
    </form>
  )
}
