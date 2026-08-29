import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import {
  AiComposer,
  type AiComposerCommand,
  type AiComposerSubmitPayload,
} from '@sun-world/ai-composer'
import { SunIcon } from '@sun-world/icons/react'
import { Button } from '@sun-world/base-ui/button'
import { SunChatShell } from '@sun-world/ui/chat-shell'

import { AiMessageView } from './AiMessageView'
import { AiProviderSettings } from './AiProviderSettings'
import type {
  AiProviderDraft,
  AiRendererRegistry,
  AiRunState,
  AiUiConversation,
  AiUiMessage,
  AiUiProvider,
  AiUiProviderProfile,
} from './types'
import './ai-ui.css'

export interface AiWorkspaceProps {
  conversations: AiUiConversation[]
  activeConversationId?: string
  messages: AiUiMessage[]
  runState: AiRunState
  providers?: AiUiProvider[]
  providerProfiles?: AiUiProviderProfile[]
  commands?: AiComposerCommand[]
  renderers?: AiRendererRegistry
  toolbarActions?: ReactNode
  sidebarWidth?: number
  onSidebarWidthChange?: (width: number) => void
  onNewConversation: () => void
  onSelectConversation: (id: string) => void
  onSend: (payload: AiComposerSubmitPayload) => void | Promise<void>
  onStop: () => void
  onEditMessage: (messageId: string, content: string) => void
  onRegenerate: (messageId: string) => void
  onRetry?: () => void
  onFeedback: (messageId: string, value: 'like' | 'dislike' | 'none') => void
  onSaveProvider?: (draft: AiProviderDraft) => void | Promise<void>
}

export function AiWorkspace({
  conversations,
  activeConversationId,
  messages,
  runState,
  providers = [],
  providerProfiles = [],
  commands = [],
  renderers,
  toolbarActions,
  sidebarWidth = 288,
  onSidebarWidthChange,
  onNewConversation,
  onSelectConversation,
  onSend,
  onStop,
  onEditMessage,
  onRegenerate,
  onRetry,
  onFeedback,
  onSaveProvider,
}: AiWorkspaceProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const defaultProfile = providerProfiles.find((profile) => profile.isDefault)
  const defaultModelId = defaultProfile
    ? `profile:${defaultProfile.id}`
    : providers[0]?.id
      ? `provider:${providers[0].id}`
      : ''
  const [selectedModelId, setSelectedModelId] = useState(defaultModelId)
  const [currentSidebarWidth, setCurrentSidebarWidth] = useState(sidebarWidth)
  const drag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)

  useEffect(() => setCurrentSidebarWidth(sidebarWidth), [sidebarWidth])

  const composerModels = useMemo(
    () => [
      ...providerProfiles.map((profile) => ({
        id: `profile:${profile.id}`,
        label: profile.model,
        description: profile.name,
        group: '已保存模型',
      })),
      ...providers.map((provider) => ({
        id: `provider:${provider.id}`,
        label: provider.defaultModel ?? provider.name,
        description: provider.name,
        group: '服务默认模型',
      })),
    ],
    [providerProfiles, providers]
  )

  useEffect(() => {
    if (defaultProfile) setSelectedModelId(`profile:${defaultProfile.id}`)
  }, [defaultProfile?.id])

  useEffect(() => {
    if (!composerModels.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(composerModels[0]?.id ?? defaultModelId)
    }
  }, [composerModels, defaultModelId, selectedModelId])

  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const query = matchMedia('(max-width: 720px)')
    if (query.matches) setSidebarOpen(false)
  }, [])

  const resizeSidebar = (width: number) => {
    const next = Math.min(420, Math.max(224, Math.round(width)))
    setCurrentSidebarWidth(next)
    onSidebarWidthChange?.(next)
  }

  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: currentSidebarWidth,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const continueResize = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return
    resizeSidebar(drag.current.startWidth + event.clientX - drag.current.startX)
  }

  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    drag.current = null
  }

  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    resizeSidebar(currentSidebarWidth + (event.key === 'ArrowLeft' ? -16 : 16))
  }

  return (
    <SunChatShell
      ariaLabel="Sun World AI 工作区"
      sidebarWidth={currentSidebarWidth}
      sidebarCollapsed={!sidebarOpen}
      floating={
        sidebarOpen ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="sw-ai-sidebar-scrim"
            aria-label="关闭对话列表遮罩"
            onClick={() => setSidebarOpen(false)}
          />
        ) : null
      }
      rail={
        !sidebarOpen ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="sw-ai-sidebar-toggle"
            aria-label="打开对话列表"
            onClick={() => setSidebarOpen(true)}
          >
            <SunIcon name="panel-left-open" />
          </Button>
        ) : null
      }
      sidebar={
        <aside className="sw-ai-sidebar">
          <div className="sw-ai-sidebar-head">
            <Button type="button" onClick={onNewConversation}>
              <SunIcon name="plus" />
              新对话
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="收起对话列表"
              onClick={() => setSidebarOpen(false)}
            >
              <SunIcon name="panel-left" />
            </Button>
          </div>
          <nav aria-label="对话历史">
            {conversations.map((conversation) => (
              <Button
                type="button"
                variant="ghost"
                key={conversation.id}
                aria-current={
                  conversation.id === activeConversationId ? 'page' : undefined
                }
                onClick={() => onSelectConversation(conversation.id)}
              >
                {conversation.title}
              </Button>
            ))}
          </nav>
          <div
            className="sw-ai-sidebar-resizer"
            role="separator"
            aria-label="调整对话列表宽度"
            aria-orientation="vertical"
            aria-valuemin={224}
            aria-valuemax={420}
            aria-valuenow={currentSidebarWidth}
            tabIndex={0}
            onPointerDown={startResize}
            onPointerMove={continueResize}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
            onKeyDown={resizeWithKeyboard}
          />
        </aside>
      }
    >
      <main className="sw-ai-workspace">
        <header className="sw-ai-toolbar">
          <div className="sw-ai-toolbar-brand">
            <strong>Sun World AI</strong>
            <span>{providers[0]?.name ?? 'AI'}</span>
          </div>
          <div className="sw-ai-toolbar-actions">
            {toolbarActions}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="模型设置"
              onClick={() => setSettingsOpen(true)}
            >
              <SunIcon name="settings" />
            </Button>
          </div>
        </header>

        <section className="sw-ai-transcript" aria-live="polite">
          {messages.length ? (
            messages.map((message) => (
              <AiMessageView
                key={message.id}
                message={message}
                renderers={renderers}
                onEdit={onEditMessage}
                onRegenerate={onRegenerate}
                onFeedback={onFeedback}
              />
            ))
          ) : (
            <div className="sw-ai-empty">
              <span className="sw-ai-orb" aria-hidden="true" />
              <h1>今天想一起完成什么？</h1>
              <p>
                可以聊天，也可以让 AI 返回表格、图表、链接和可保存的生成记录。
              </p>
            </div>
          )}
          {runState.status === 'error' ? (
            <div className="sw-ai-error" role="alert">
              <strong>生成没有完成</strong>
              <p>{runState.message}</p>
              {runState.retryable ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={onRetry}
                  disabled={!onRetry}
                >
                  重试
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="sw-ai-composer-wrap">
          <AiComposer
            value={draft}
            onValueChange={setDraft}
            placeholder="给 Sun World AI 发消息"
            loading={runState.status === 'running'}
            models={composerModels}
            modelId={selectedModelId}
            onModelChange={setSelectedModelId}
            commands={commands}
            onSubmit={onSend}
            onCancel={onStop}
          />
          <small>AI 可能会出错，请核对重要信息。</small>
        </div>
      </main>
      <AiProviderSettings
        open={settingsOpen}
        providers={providers}
        profiles={providerProfiles}
        onOpenChange={setSettingsOpen}
        onSave={onSaveProvider}
      />
    </SunChatShell>
  )
}
