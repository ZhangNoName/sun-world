import { useEffect, useState } from 'react'
import { SunIcon } from '@sun-world/icons/react'
import { Button } from '@sun-world/base-ui/button'
import { Label } from '@sun-world/base-ui/label'
import { Textarea } from '@sun-world/base-ui/textarea'
import { SwCollapsible } from '@sun-world/ui/sw-collapsible'
import { SwTooltip } from '@sun-world/ui/sw-tooltip'

import { AiBlockRenderer } from './AiBlockRenderer'
import type { AiRendererRegistry, AiUiMessage } from './types'

const messageTime = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export function AiMessageView({
  message,
  busy = false,
  renderers,
  onEdit,
  onRegenerate,
  onFeedback,
}: {
  message: AiUiMessage
  busy?: boolean
  renderers?: AiRendererRegistry
  onEdit: (messageId: string, content: string) => void
  onRegenerate: (messageId: string) => void
  onFeedback: (messageId: string, value: 'like' | 'dislike' | 'none') => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => messageText(message))
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle')
  const assistant = message.role === 'assistant'
  const streaming = message.status === 'streaming'
  const reasoningSummary = assistant && message.reasoningSummary?.trim()
  const timestamp = message.createdAt ? Date.parse(message.createdAt) : NaN
  const showTime =
    Number.isFinite(timestamp) &&
    (message.role === 'user' || (assistant && message.status === 'completed'))
  const hasContent = message.blocks.some(
    (block) => block.type !== 'text' || block.text.trim().length > 0
  )
  const label =
    message.role === 'user'
      ? '你的消息'
      : assistant
        ? 'Sun World AI 的回复'
        : '系统消息'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(messageText(message))
      setCopyState('done')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <article
      className={`sw-ai-message sw-ai-message--${message.role}`}
      aria-label={label}
    >
      {reasoningSummary ? (
        <SwCollapsible
          className="sw-ai-reasoning"
          trigger={
            <>
              思考摘要
              <SunIcon name="chevron-down" size="xs" />
            </>
          }
        >
          <AiBlockRenderer block={{ type: 'text', text: reasoningSummary }} />
        </SwCollapsible>
      ) : null}
      {editing ? (
        <div className="sw-ai-message-editor">
          <Label htmlFor={`edit-${message.id}`}>编辑消息内容</Label>
          <Textarea
            id={`edit-${message.id}`}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          <div>
            <Button
              size="sm"
              aria-label="保存编辑"
              disabled={busy || !draft.trim()}
              onClick={() => {
                const value = draft.trim()
                if (!value) return
                onEdit(message.id, value)
                setEditing(false)
              }}
            >
              保存
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="取消编辑"
              onClick={() => {
                setDraft(messageText(message))
                setEditing(false)
              }}
            >
              取消
            </Button>
          </div>
        </div>
      ) : streaming && !hasContent ? (
        <ThinkingStatus />
      ) : hasContent ? (
        <SwTooltip
          disabled={!showTime}
          trackCursorAxis="both"
          content={
            showTime ? (
              <span>
                {assistant ? '回复完成时间' : '发送时间'}{' '}
                <time dateTime={message.createdAt}>
                  {messageTime.format(timestamp)}
                </time>
              </span>
            ) : null
          }
        >
          <div
            className="sw-ai-message-content"
            aria-busy={streaming || undefined}
            tabIndex={showTime ? 0 : undefined}
          >
            {message.blocks.map((block, index) => (
              <AiBlockRenderer
                key={index}
                block={block}
                renderers={renderers}
              />
            ))}
          </div>
        </SwTooltip>
      ) : null}
      {message.status === 'interrupted' || message.status === 'failed' ? (
        <span className="sw-ai-message-status" role="status">
          {message.status === 'interrupted' ? '已停止' : '生成失败'}
        </span>
      ) : null}
      {!editing && hasContent && !streaming ? (
        <footer className="sw-ai-message-actions">
          <ActionButton
            label={assistant ? '复制回答' : '复制消息'}
            icon={copyState === 'done' ? 'check' : 'copy'}
            onClick={copy}
          />
          {message.role === 'user' ? (
            <ActionButton
              label="编辑消息"
              icon="edit"
              disabled={busy}
              onClick={() => {
                setDraft(messageText(message))
                setEditing(true)
              }}
            />
          ) : null}
          {assistant ? (
            <>
              <ActionButton
                label="重新生成"
                icon="refresh-cw"
                disabled={busy}
                onClick={() => onRegenerate(message.id)}
              />
              <ActionButton
                label="赞"
                icon="thumbs-up"
                pressed={message.feedback === 'like'}
                onClick={() =>
                  onFeedback(
                    message.id,
                    message.feedback === 'like' ? 'none' : 'like'
                  )
                }
              />
              <ActionButton
                label="踩"
                icon="thumbs-down"
                pressed={message.feedback === 'dislike'}
                onClick={() =>
                  onFeedback(
                    message.id,
                    message.feedback === 'dislike' ? 'none' : 'dislike'
                  )
                }
              />
            </>
          ) : null}
          <span
            className={copyState === 'error' ? undefined : 'sr-only'}
            role="status"
          >
            {copyState === 'done'
              ? '复制成功'
              : copyState === 'error'
                ? '复制失败'
                : ''}
          </span>
          {message.metrics ? <MessageMetrics {...message.metrics} /> : null}
        </footer>
      ) : null}
    </article>
  )
}

function ThinkingStatus() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const startedAt = performance.now()
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((performance.now() - startedAt) / 1_000))
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="sw-ai-thinking">
      <span role="status">正在思考…</span>
      <span aria-hidden="true">{elapsed} 秒</span>
    </div>
  )
}

const tokenCount = new Intl.NumberFormat('zh-CN')
const elapsedSeconds = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 1,
})

function MessageMetrics({
  durationMs,
  tokenUsage,
}: NonNullable<AiUiMessage['metrics']>) {
  return (
    <span className="sw-ai-message-metrics">
      {durationMs !== undefined ? (
        <span>{elapsedSeconds.format(durationMs / 1_000)} 秒</span>
      ) : null}
      {tokenUsage ? (
        <SwTooltip
          content={`输入 ${tokenCount.format(tokenUsage.inputTokens)} · 输出 ${tokenCount.format(tokenUsage.outputTokens)}`}
        >
          <span className="sw-ai-token-count" tabIndex={0}>
            {tokenCount.format(tokenUsage.totalTokens)} tokens
          </span>
        </SwTooltip>
      ) : null}
    </span>
  )
}

function ActionButton({
  label,
  icon,
  onClick,
  pressed,
  disabled,
}: {
  label: string
  icon: 'check' | 'copy' | 'edit' | 'refresh-cw' | 'thumbs-up' | 'thumbs-down'
  onClick: () => void | Promise<void>
  pressed?: boolean
  disabled?: boolean
}) {
  return (
    <SwTooltip content={label}>
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={() => void onClick()}
      >
        <SunIcon name={icon} size="sm" />
      </Button>
    </SwTooltip>
  )
}

export function messageText(message: AiUiMessage) {
  return message.blocks
    .map((block) => {
      if (block.type === 'text') return block.text
      if (block.type === 'link') return `${block.label}: ${block.url}`
      if (block.type === 'table')
        return block.rows.map((row) => JSON.stringify(row)).join('\n')
      if (block.type === 'chart') return block.summary
      if (block.type === 'record') return block.title
      return `[${block.name}]`
    })
    .join('\n')
}
