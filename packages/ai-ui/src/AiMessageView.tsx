import { useState } from 'react'
import { SunIcon } from '@sun-world/icons/react'
import { Button } from '@sun-world/ui/button'

import { AiBlockRenderer } from './AiBlockRenderer'
import type { AiRendererRegistry, AiUiMessage } from './types'

export function AiMessageView({
  message,
  renderers,
  onEdit,
  onRegenerate,
  onFeedback,
}: {
  message: AiUiMessage
  renderers?: AiRendererRegistry
  onEdit: (messageId: string, content: string) => void
  onRegenerate: (messageId: string) => void
  onFeedback: (messageId: string, value: 'like' | 'dislike' | 'none') => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(() => messageText(message))
  const [copyState, setCopyState] = useState<'idle' | 'done' | 'error'>('idle')
  const assistant = message.role === 'assistant'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(messageText(message))
      setCopyState('done')
    } catch {
      setCopyState('error')
    }
  }

  return (
    <article className={`sw-ai-message sw-ai-message--${message.role}`}>
      <header>
        <strong>
          {assistant
            ? 'Sun World AI'
            : message.role === 'user'
              ? '你'
              : message.role}
        </strong>
        {message.status === 'streaming' ? (
          <span role="status">正在生成</span>
        ) : null}
      </header>
      {editing ? (
        <div className="sw-ai-message-editor">
          <label htmlFor={`edit-${message.id}`}>编辑消息内容</label>
          <textarea
            id={`edit-${message.id}`}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          <div>
            <Button
              size="sm"
              aria-label="保存编辑"
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
      ) : (
        <div className="sw-ai-message-content">
          {message.blocks.map((block, index) => (
            <AiBlockRenderer key={index} block={block} renderers={renderers} />
          ))}
          {message.status === 'streaming' && message.blocks.length === 0 ? (
            <span className="sw-ai-thinking" aria-label="AI 正在思考">
              <i />
              <i />
              <i />
            </span>
          ) : null}
        </div>
      )}
      {!editing ? (
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
              onClick={() => setEditing(true)}
            />
          ) : null}
          {assistant ? (
            <>
              <ActionButton
                label="重新生成"
                icon="refresh-cw"
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
          <span className="sw-ai-copy-status" role="status">
            {copyState === 'done'
              ? '已复制'
              : copyState === 'error'
                ? '复制失败'
                : ''}
          </span>
        </footer>
      ) : null}
    </article>
  )
}

function ActionButton({
  label,
  icon,
  onClick,
  pressed,
}: {
  label: string
  icon: 'check' | 'copy' | 'edit' | 'refresh-cw' | 'thumbs-up' | 'thumbs-down'
  onClick: () => void | Promise<void>
  pressed?: boolean
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      aria-label={label}
      aria-pressed={pressed}
      onClick={() => void onClick()}
    >
      <SunIcon name={icon} size="sm" />
    </Button>
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
