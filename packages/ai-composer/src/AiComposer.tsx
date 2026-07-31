import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { SunIcon } from '@sun-world/icons/react'

import { AttachmentList } from './attachments/AttachmentList'
import { validateIncomingFiles } from './attachments/files'
import { CommandPalette } from './commands/CommandPalette'
import {
  commandQuery,
  filterCommands,
  nextEnabledCommandIndex,
} from './commands/commands'
import { ModelSelector } from './model-selector/ModelSelector'
import { AiComposerSubmitError } from './errors'
import { createBrowserSpeechAdapter } from './speech/browserSpeechAdapter'
import { useSpeechInput } from './speech/useSpeechInput'
import type {
  AiComposerCommand,
  AiComposerHandle,
  AiComposerProps,
  AiComposerSubmitOverrides,
} from './types'
import './styles/ai-composer.css'

export const AiComposer = forwardRef<AiComposerHandle, AiComposerProps>(
  function AiComposer(
    {
      value,
      onValueChange,
      models,
      modelId,
      onModelChange,
      commands = [],
      onSubmit,
      onCancel,
      loading = false,
      disabled = false,
      placeholder = '消息',
      accept,
      maxFiles = 5,
      maxFileSize = 10 * 1024 * 1024,
      speechAdapter,
    },
    ref
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const submittingRef = useRef(false)
    const [submitting, setSubmitting] = useState(false)
    const [submissionError, setSubmissionError] = useState<string>()
    const [files, setFiles] = useState<File[]>([])
    const [duplicateFiles, setDuplicateFiles] = useState<string[]>([])
    const [rejectedFiles, setRejectedFiles] = useState(0)
    const [selectedCommandId, setSelectedCommandId] = useState<string>()
    const [activeCommandIndex, setActiveCommandIndex] = useState(-1)
    const [commandPaletteDismissed, setCommandPaletteDismissed] =
      useState(false)
    const [speechNoticeVisible, setSpeechNoticeVisible] = useState(false)
    const resolvedSpeechAdapter = useMemo(
      () => speechAdapter ?? createBrowserSpeechAdapter(),
      [speechAdapter]
    )
    const speech = useSpeechInput({
      adapter: resolvedSpeechAdapter,
      onFinalTranscript: (transcript) =>
        onValueChange(appendTranscript(value, transcript)),
    })

    const selectedModel = models.find((model) => model.id === modelId)
    const selectedCommand = commands.find(
      (command) => command.id === selectedCommandId
    )
    const trigger = commandQuery(value)
    const visibleCommands = trigger
      ? filterCommands(commands, trigger.query)
      : []
    const commandPaletteOpen =
      Boolean(trigger) && commands.length > 0 && !commandPaletteDismissed
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

    useEffect(() => {
      if (!duplicateFiles.length) return
      const timeout = window.setTimeout(() => setDuplicateFiles([]), 2500)
      return () => window.clearTimeout(timeout)
    }, [duplicateFiles])

    const submit = async (
      overrides: AiComposerSubmitOverrides = {}
    ): Promise<boolean> => {
      speech.stop()
      if (submittingRef.current || disabled || loading) return false
      const nextMarkdown = (overrides.markdown ?? value).trim()
      const nextModelId = overrides.modelId ?? modelId
      const nextModel = models.find((model) => model.id === nextModelId)
      if (!nextMarkdown || !nextModel || nextModel.disabled) return false

      submittingRef.current = true
      setSubmitting(true)
      setSubmissionError(undefined)
      try {
        await onSubmit({
          markdown: nextMarkdown,
          files: overrides.files ?? files,
          modelId: nextModelId,
          commandId: overrides.commandId ?? selectedCommandId,
        })
        onValueChange('')
        setFiles([])
        setDuplicateFiles([])
        setSelectedCommandId(undefined)
        return true
      } catch (error) {
        setSubmissionError(
          error instanceof AiComposerSubmitError
            ? error.message
            : '发送失败，请重试。'
        )
        return false
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    }

    const cancel = () => {
      speech.stop()
      onCancel?.()
    }
    const reset = () => {
      speech.stop()
      setSubmissionError(undefined)
      setFiles([])
      setDuplicateFiles([])
      setSelectedCommandId(undefined)
      setCommandPaletteDismissed(false)
      setSpeechNoticeVisible(false)
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
      [
        disabled,
        files,
        loading,
        modelId,
        models,
        onCancel,
        onSubmit,
        onValueChange,
        selectedCommandId,
        speech,
        value,
      ]
    )

    const handleSubmit = (event: FormEvent) => {
      event.preventDefault()
      void submit()
    }
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (commandPaletteOpen) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setCommandPaletteDismissed(true)
          return
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setActiveCommandIndex((current) =>
            nextEnabledCommandIndex(
              visibleCommands,
              current,
              event.key === 'ArrowDown' ? 1 : -1
            )
          )
          return
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const command =
            visibleCommands[activeCommandIndex] ??
            visibleCommands.find((item) => !item.disabled)
          if (command) {
            event.preventDefault()
            selectCommand(command)
            return
          }
        }
      }
      if (event.key !== 'Enter' || event.shiftKey) return
      event.preventDefault()
      void submit()
    }

    const selectCommand = (command: AiComposerCommand) => {
      if (command.disabled) return
      setSelectedCommandId(command.id)
      setActiveCommandIndex(-1)
      setCommandPaletteDismissed(true)
      if (trigger) onValueChange(value.slice(0, trigger.start).trimEnd())
      textareaRef.current?.focus()
    }

    const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
      const result = validateIncomingFiles(files, event.target.files ?? [], {
        accept,
        maxFiles,
        maxFileSize,
      })
      setFiles(result.accepted)
      setDuplicateFiles([
        ...new Set(result.duplicates.map((file) => file.name)),
      ])
      setRejectedFiles(result.rejectedCount)
      event.target.value = ''
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
        {commandPaletteOpen ? (
          <CommandPalette
            commands={visibleCommands}
            activeIndex={activeCommandIndex}
            onSelect={selectCommand}
          />
        ) : null}
        <AttachmentList
          files={files}
          onRemove={(index) =>
            setFiles((items) =>
              items.filter((_, itemIndex) => itemIndex !== index)
            )
          }
        />
        {duplicateFiles.length ? (
          <div className="sw-ai-composer__duplicate-notice" role="status">
            重复文件：{duplicateFiles.join('、')}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          aria-label={placeholder}
          aria-describedby={
            !canSubmit ? 'sw-ai-composer-disabled-reason' : undefined
          }
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          onChange={(event) => {
            setCommandPaletteDismissed(false)
            setActiveCommandIndex(-1)
            onValueChange(event.target.value)
          }}
          onInput={resize}
          onKeyDown={handleKeyDown}
        />
        {speech.interimTranscript ? (
          <div className="sw-ai-composer__speech-interim" role="status">
            {speech.interimTranscript}
          </div>
        ) : null}
        <div className="sw-ai-composer__toolbar">
          <div className="sw-ai-composer__tools sw-ai-composer__tools--start">
            <label
              className="sw-ai-composer__icon-button sw-ai-composer__attachment-trigger"
              title="添加附件"
            >
              <SunIcon name="plus" />
              <span className="sw-ai-composer__sr-only">添加附件</span>
              <input
                type="file"
                aria-label="添加附件"
                accept={accept}
                multiple
                disabled={disabled || loading}
                onChange={addFiles}
              />
            </label>
            {selectedCommand ? (
              <button
                type="button"
                aria-label={`移除命令 ${selectedCommand.label}`}
                onClick={() => setSelectedCommandId(undefined)}
              >
                <SunIcon name="square" size="xs" />
                <span>{selectedCommand.label}</span>
                <SunIcon name="x" size="xs" />
              </button>
            ) : null}
          </div>
          <div className="sw-ai-composer__tools sw-ai-composer__tools--end">
            <ModelSelector
              models={models}
              modelId={modelId}
              onModelChange={onModelChange}
            />
            <button
              type="button"
              aria-label={
                speech.status === 'listening' ? '停止语音输入' : '开始语音输入'
              }
              disabled={disabled || loading || speech.status === 'checking'}
              onClick={() => {
                setSpeechNoticeVisible(true)
                void speech.toggle()
              }}
            >
              <SunIcon name="mic" />
            </button>
            {loading ? (
              <button type="button" aria-label="停止生成" onClick={cancel}>
                <SunIcon name="square" size="xs" />
              </button>
            ) : (
              <button type="submit" aria-label="发送消息" disabled={!canSubmit}>
                <SunIcon name="send" size="sm" />
              </button>
            )}
          </div>
        </div>
        {rejectedFiles ? (
          <div role="status">{rejectedFiles} 个文件未添加</div>
        ) : null}
        {speechNoticeVisible &&
        (speech.status === 'denied' || speech.status === 'unsupported') ? (
          <div className="sw-ai-composer__notice" role="status">
            {speech.status === 'denied'
              ? '请在浏览器设置中允许麦克风权限。'
              : '当前浏览器不支持语音输入。'}
          </div>
        ) : null}
        {speech.status === 'error' ? (
          <div className="sw-ai-composer__notice" role="alert">
            语音识别失败，请重试。
          </div>
        ) : null}
        {!canSubmit ? (
          <span
            id="sw-ai-composer-disabled-reason"
            className="sw-ai-composer__sr-only"
          >
            {disabledReason}
          </span>
        ) : null}
        {submissionError ? <div role="alert">{submissionError}</div> : null}
      </form>
    )
  }
)

function appendTranscript(current: string, transcript: string) {
  const value = transcript.trim()
  if (!value) return current
  if (!current || /\s$/.test(current)) return `${current}${value}`
  return `${current} ${value}`
}
