import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'

import type {
  AiComposerHandle,
  AiComposerProps,
  AiComposerSubmitOverrides,
} from './types'

export const AiComposer = forwardRef<AiComposerHandle, AiComposerProps>(
  function AiComposer(
    {
      value,
      onValueChange,
      models,
      modelId,
      onSubmit,
      onCancel,
      loading = false,
      disabled = false,
      placeholder = '消息',
    },
    ref
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const submittingRef = useRef(false)
    const [submitting, setSubmitting] = useState(false)
    const [submissionError, setSubmissionError] = useState(false)

    const selectedModel = models.find((model) => model.id === modelId)
    const canSubmit =
      value.trim().length > 0 &&
      Boolean(selectedModel && !selectedModel.disabled) &&
      !disabled &&
      !loading &&
      !submitting

    const resize = () => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`
    }

    useEffect(resize, [value])

    const submit = async (
      overrides: AiComposerSubmitOverrides = {}
    ): Promise<boolean> => {
      if (submittingRef.current || disabled || loading) return false
      const nextMarkdown = (overrides.markdown ?? value).trim()
      const nextModelId = overrides.modelId ?? modelId
      const nextModel = models.find((model) => model.id === nextModelId)
      if (!nextMarkdown || !nextModel || nextModel.disabled) return false

      submittingRef.current = true
      setSubmitting(true)
      setSubmissionError(false)
      try {
        await onSubmit({
          markdown: nextMarkdown,
          files: overrides.files ?? [],
          modelId: nextModelId,
          commandId: overrides.commandId,
        })
        onValueChange('')
        return true
      } catch {
        setSubmissionError(true)
        return false
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    }

    const cancel = () => onCancel?.()
    const reset = () => {
      setSubmissionError(false)
      onValueChange('')
    }

    useImperativeHandle(
      ref,
      () => ({
        focus: () => textareaRef.current?.focus(),
        setQuestion: (markdown) => {
          textareaRef.current?.focus()
          onValueChange(markdown)
        },
        submit,
        cancel,
        reset,
      }),
      [disabled, loading, modelId, models, onCancel, onSubmit, onValueChange, value]
    )

    const handleSubmit = (event: FormEvent) => {
      event.preventDefault()
      void submit()
    }
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) return
      event.preventDefault()
      void submit()
    }

    const disabledReason = disabled
      ? '输入框已禁用'
      : loading || submitting
        ? '正在发送消息'
        : !selectedModel || selectedModel.disabled
          ? '请选择可用模型'
          : '请输入消息'

    return (
      <form className="sw-ai-composer" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          aria-label={placeholder}
          aria-describedby={!canSubmit ? 'sw-ai-composer-disabled-reason' : undefined}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          onChange={(event) => onValueChange(event.target.value)}
          onInput={resize}
          onKeyDown={handleKeyDown}
        />
        <div className="sw-ai-composer__toolbar">
          {loading ? (
            <button type="button" aria-label="停止生成" onClick={cancel}>
              停止
            </button>
          ) : (
            <button type="submit" aria-label="发送消息" disabled={!canSubmit}>
              发送
            </button>
          )}
        </div>
        {!canSubmit ? (
          <span id="sw-ai-composer-disabled-reason" className="sr-only">
            {disabledReason}
          </span>
        ) : null}
        {submissionError ? <div role="alert">发送失败，请重试。</div> : null}
      </form>
    )
  }
)
