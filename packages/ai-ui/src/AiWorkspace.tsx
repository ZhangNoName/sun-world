import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  AiComposer,
  type AiComposerCommand,
  type AiComposerHandle,
  type AiComposerSubmitPayload,
} from '@sun-world/ai-composer'
import { Button, buttonVariants } from '@sun-world/base-ui/button'
import { Input } from '@sun-world/base-ui/input'
import { SunIcon } from '@sun-world/icons/react'
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

const suggestedPrompts = [
  {
    icon: 'file-text' as const,
    text: '总结最近的 Sun World 项目进展',
  },
  {
    icon: 'arrow-up-down' as const,
    text: '帮我分析一组数据并生成图表',
  },
  {
    icon: 'edit' as const,
    text: '把一段文字改写得更清晰',
  },
]

const sidebarRowLinkClass = buttonVariants({
  variant: 'ghost',
  className: 'sw-ai-sidebar-row',
})
const sidebarPanelLinkClass = buttonVariants({
  variant: 'ghost',
  className: 'sw-ai-sidebar-flyout-item',
})

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
  railBrand?: ReactNode
  railFooter?: ReactNode
  sidebarWidth?: number
  onSidebarWidthChange?: (width: number) => void
  isAuthenticated?: boolean
  accountHref?: string
  accountLabel?: string
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
  railBrand,
  railFooter,
  sidebarWidth = 260,
  onSidebarWidthChange,
  isAuthenticated = false,
  accountHref = isAuthenticated ? '/me' : '/login',
  accountLabel = isAuthenticated ? '个人中心' : '登录',
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
  const [isMobile, setIsMobile] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [pluginsOpen, setPluginsOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(true)
  const [recentNewestFirst, setRecentNewestFirst] = useState(true)
  const [draft, setDraft] = useState('')
  const composerRef = useRef<AiComposerHandle>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const pluginsTriggerRef = useRef<HTMLButtonElement>(null)
  const moreTriggerRef = useRef<HTMLButtonElement>(null)
  const railOpenRef = useRef<HTMLButtonElement>(null)
  const closeSidebarRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const recentRef = useRef<HTMLButtonElement>(null)
  const defaultProfile = providerProfiles.find((profile) => profile.isDefault)
  const enabledProviders = useMemo(
    () => providers.filter((provider) => provider.isEnabled !== false),
    [providers]
  )
  const defaultProvider =
    enabledProviders.find((provider) => provider.isDefault) ??
    enabledProviders[0]
  const defaultModelId = defaultProfile
    ? `profile:${defaultProfile.id}`
    : defaultProvider?.id
      ? `model:${defaultProvider.id}`
      : ''
  const [selectedModelId, setSelectedModelId] = useState(defaultModelId)
  const [currentSidebarWidth, setCurrentSidebarWidth] = useState(sidebarWidth)
  const drag = useRef<{
    pointerId: number
    startX: number
    startWidth: number
  } | null>(null)
  const pendingSidebarWidth = useRef<number | null>(null)
  const resizeFrame = useRef<number | null>(null)

  useEffect(() => setCurrentSidebarWidth(sidebarWidth), [sidebarWidth])

  useEffect(
    () => () => {
      if (resizeFrame.current !== null) {
        cancelAnimationFrame(resizeFrame.current)
      }
      resizeFrame.current = null
      pendingSidebarWidth.current = null
    },
    []
  )

  const composerModels = useMemo(
    () => [
      ...providerProfiles.map((profile) => ({
        id: `profile:${profile.id}`,
        label: profile.model,
        description: profile.name,
        group: '已保存模型',
      })),
      ...enabledProviders.map((provider) => ({
        id: `model:${provider.id}`,
        label: provider.defaultModel ?? provider.name,
        description: provider.name,
        group: '服务默认模型',
      })),
    ],
    [enabledProviders, providerProfiles]
  )

  useEffect(() => {
    if (defaultProfile) {
      setSelectedModelId(`profile:${defaultProfile.id}`)
      return
    }
    if (defaultProvider) setSelectedModelId(`model:${defaultProvider.id}`)
  }, [defaultProfile?.id, defaultProvider?.id])

  useEffect(() => {
    if (!composerModels.some((model) => model.id === selectedModelId)) {
      setSelectedModelId(composerModels[0]?.id ?? defaultModelId)
    }
  }, [composerModels, defaultModelId, selectedModelId])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(max-width: 768px)')
    const sync = () => {
      setIsMobile(query.matches)
      if (query.matches) setSidebarOpen(false)
    }
    sync()
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    if (!sidebarOpen) return
    if (searchOpen) {
      queueMicrotask(() => searchRef.current?.focus())
      return
    }
    if (isMobile) queueMicrotask(() => closeSidebarRef.current?.focus())
  }, [isMobile, searchOpen, sidebarOpen])

  useEffect(() => {
    if (!isMobile || !sidebarOpen) return
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSidebarOpen(false)
        queueMicrotask(() => railOpenRef.current?.focus())
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isMobile, sidebarOpen])

  useEffect(() => {
    if (!pluginsOpen && !moreOpen) return
    const closeFlyout = (event: globalThis.PointerEvent) => {
      const target = event.target as Node
      if (target instanceof Element && target.closest('[role="dialog"]')) {
        return
      }
      if (
        flyoutRef.current?.contains(target) ||
        pluginsTriggerRef.current?.contains(target) ||
        moreTriggerRef.current?.contains(target)
      ) {
        return
      }
      setPluginsOpen(false)
      setMoreOpen(false)
    }
    const closeWithEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      const trigger = pluginsOpen
        ? pluginsTriggerRef.current
        : moreTriggerRef.current
      setPluginsOpen(false)
      setMoreOpen(false)
      queueMicrotask(() => trigger?.focus())
    }
    document.addEventListener('pointerdown', closeFlyout)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeFlyout)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [moreOpen, pluginsOpen])

  const visibleConversations = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
    const conversationsWithContent = conversations.filter(
      (conversation) =>
        !(
          conversation.id === activeConversationId &&
          messages.length === 0 &&
          conversation.title === '新对话'
        )
    )
    const filtered = normalizedQuery
      ? conversationsWithContent.filter((conversation) =>
          conversation.title.toLocaleLowerCase().includes(normalizedQuery)
        )
      : conversationsWithContent
    return recentNewestFirst ? filtered : [...filtered].reverse()
  }, [
    activeConversationId,
    conversations,
    messages.length,
    recentNewestFirst,
    searchQuery,
  ])

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
    pendingSidebarWidth.current =
      drag.current.startWidth + event.clientX - drag.current.startX
    if (resizeFrame.current !== null) return
    resizeFrame.current = requestAnimationFrame(() => {
      resizeFrame.current = null
      const width = pendingSidebarWidth.current
      pendingSidebarWidth.current = null
      if (width !== null) resizeSidebar(width)
    })
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

  const closeSidebar = () => {
    setPluginsOpen(false)
    setMoreOpen(false)
    setSidebarOpen(false)
    queueMicrotask(() => railOpenRef.current?.focus())
  }

  const openSidebar = () => setSidebarOpen(true)

  const openSearch = () => {
    setSearchOpen(true)
    setSidebarOpen(true)
  }

  const openRecent = () => {
    setRecentOpen(true)
    setSidebarOpen(true)
    queueMicrotask(() => recentRef.current?.focus())
  }

  const startFreshConversation = () => {
    onNewConversation()
    composerRef.current?.reset()
    if (isMobile) setSidebarOpen(false)
    queueMicrotask(() => composerRef.current?.focus())
  }

  const selectConversation = (id: string) => {
    onSelectConversation(id)
    if (isMobile) setSidebarOpen(false)
  }

  const renderComposer = () => (
    <AiComposer
      ref={composerRef}
      variant="chat"
      value={draft}
      onValueChange={setDraft}
      placeholder="询问 Sun World AI"
      loading={runState.status === 'running'}
      models={composerModels}
      modelId={selectedModelId}
      onModelChange={setSelectedModelId}
      commands={commands}
      onSubmit={onSend}
      onCancel={onStop}
    />
  )

  const renderError = () =>
    runState.status === 'error' ? (
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
    ) : null

  return (
    <SunChatShell
      ariaLabel="Sun World AI 工作区"
      sidebarWidth={currentSidebarWidth}
      railWidth={52}
      sidebarCollapsed={!sidebarOpen}
      floating={
        sidebarOpen ? (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="sw-ai-sidebar-scrim"
              aria-label="关闭对话列表遮罩"
              onClick={closeSidebar}
            />
            {pluginsOpen || moreOpen ? (
              <div
                ref={flyoutRef}
                id="sw-ai-sidebar-flyout"
                className="sw-ai-sidebar-flyout"
                style={
                  {
                    '--sw-ai-flyout-top': `${pluginsOpen ? 184 : 220}px`,
                  } as CSSProperties
                }
                role="menu"
                aria-label={pluginsOpen ? '插件设置' : '更多功能'}
              >
                {pluginsOpen ? (
                  <>
                    {toolbarActions}
                    <Button
                      type="button"
                      variant="ghost"
                      className="sw-ai-sidebar-flyout-item"
                      aria-label="模型设置"
                      onClick={() => {
                        setSettingsOpen(true)
                      }}
                    >
                      <SunIcon name="settings" />
                      <span>模型与服务商</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <a
                      className={sidebarPanelLinkClass}
                      href="/canvas"
                      role="menuitem"
                    >
                      <SunIcon name="image" />
                      <span>图片</span>
                    </a>
                    <a
                      className={sidebarPanelLinkClass}
                      href="/tools?category=map"
                      role="menuitem"
                    >
                      <SunIcon name="map-pin" />
                      <span>地图</span>
                      <small>新</small>
                    </a>
                    <a
                      className={sidebarPanelLinkClass}
                      href="/tools?category=finance"
                      role="menuitem"
                    >
                      <SunIcon name="badge-dollar-sign" />
                      <span>财务</span>
                    </a>
                    <a
                      className={sidebarPanelLinkClass}
                      href="/home"
                      role="menuitem"
                    >
                      <SunIcon name="group" />
                      <span>站点</span>
                      <small>新</small>
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      className="sw-ai-sidebar-flyout-item"
                      role="menuitem"
                      onClick={() => {
                        setSettingsOpen(true)
                      }}
                    >
                      <SunIcon name="box" />
                      <span>GPT</span>
                    </Button>
                  </>
                )}
              </div>
            ) : null}
          </>
        ) : null
      }
      rail={
        <div className="sw-ai-rail" aria-label="收起的对话导航">
          <Button
            ref={railOpenRef}
            type="button"
            size="icon-lg"
            variant="ghost"
            className="sw-ai-rail-brand"
            aria-label="打开对话列表"
            aria-expanded={sidebarOpen}
            aria-controls="sw-ai-sidebar"
            title="打开侧边栏"
            onClick={openSidebar}
          >
            {railBrand ?? <SunIcon name="panel-left-open" />}
          </Button>
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            aria-label="新聊天"
            title="新聊天"
            onClick={startFreshConversation}
          >
            <SunIcon name="edit" />
          </Button>
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            aria-label="搜索聊天"
            title="搜索聊天"
            onClick={openSearch}
          >
            <SunIcon name="search" />
          </Button>
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            aria-label="最近聊天"
            title="最近聊天"
            onClick={openRecent}
          >
            <SunIcon name="message-circle" />
          </Button>
          <div className="sw-ai-rail-footer">
            {railFooter ?? (
              <a
                className="sw-ai-rail-account"
                href={accountHref}
                aria-label={accountLabel}
                title={accountLabel}
              >
                <SunIcon name="user" />
              </a>
            )}
          </div>
        </div>
      }
      sidebar={
        <div ref={sidebarRef} id="sw-ai-sidebar" className="sw-ai-sidebar">
          <div className="sw-ai-sidebar-head">
            <a className="sw-ai-sidebar-brand" href="/home">
              Sun World
            </a>
            <Button
              ref={pluginsTriggerRef}
              type="button"
              size="icon-lg"
              variant="ghost"
              aria-label="搜索聊天"
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((value) => !value)
                queueMicrotask(() => searchRef.current?.focus())
              }}
            >
              <SunIcon name="search" />
            </Button>
            <Button
              ref={closeSidebarRef}
              type="button"
              size="icon-lg"
              variant="ghost"
              aria-label="收起对话列表"
              aria-expanded={sidebarOpen}
              aria-controls="sw-ai-sidebar"
              onClick={closeSidebar}
            >
              <SunIcon name="panel-left" />
            </Button>
          </div>

          {searchOpen ? (
            <div className="sw-ai-sidebar-search">
              <SunIcon name="search" size="sm" />
              <Input
                ref={searchRef}
                type="search"
                value={searchQuery}
                aria-label="搜索聊天"
                placeholder="搜索聊天"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="清空搜索"
                  onClick={() => {
                    setSearchQuery('')
                    searchRef.current?.focus()
                  }}
                >
                  <SunIcon name="x" size="xs" />
                </Button>
              ) : null}
            </div>
          ) : null}

          <nav className="sw-ai-sidebar-nav" aria-label="主要功能">
            <Button
              type="button"
              variant="ghost"
              className="sw-ai-sidebar-row sw-ai-sidebar-row--active"
              onClick={startFreshConversation}
            >
              <SunIcon name="edit" />
              <span>新聊天</span>
            </Button>
            <a className={sidebarRowLinkClass} href="/blog">
              <SunIcon name="file-text" />
              <span>资料库</span>
            </a>
            <a className={sidebarRowLinkClass} href="/canvas">
              <SunIcon name="frame" />
              <span>项目</span>
            </a>
            <a className={sidebarRowLinkClass} href="/keep">
              <SunIcon name="calendar" />
              <span>已安排</span>
            </a>
            <Button
              type="button"
              variant="ghost"
              className="sw-ai-sidebar-row"
              aria-expanded={pluginsOpen}
              aria-controls="sw-ai-sidebar-flyout"
              onClick={() => {
                setMoreOpen(false)
                setPluginsOpen((value) => !value)
              }}
            >
              <SunIcon name="settings" />
              <span>插件</span>
            </Button>
            <Button
              ref={moreTriggerRef}
              type="button"
              variant="ghost"
              className="sw-ai-sidebar-row"
              aria-expanded={moreOpen}
              aria-controls="sw-ai-sidebar-flyout"
              onClick={() => {
                setPluginsOpen(false)
                setMoreOpen((value) => !value)
              }}
            >
              <SunIcon name="more-horizontal" />
              <span>更多</span>
            </Button>
          </nav>

          <section className="sw-ai-sidebar-recents" aria-label="对话历史">
            <div className="sw-ai-sidebar-section-head">
              <Button
                ref={recentRef}
                type="button"
                variant="ghost"
                aria-expanded={recentOpen}
                onClick={() => setRecentOpen((value) => !value)}
              >
                最近
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={
                  recentNewestFirst ? '按最早会话排序' : '按最近会话排序'
                }
                aria-pressed={!recentNewestFirst}
                title="整理聊天"
                onClick={() => setRecentNewestFirst((value) => !value)}
              >
                <SunIcon name="arrow-up-down" size="xs" />
              </Button>
            </div>
            {recentOpen ? (
              <nav className="sw-ai-conversation-list" aria-label="最近聊天">
                {visibleConversations.map((conversation) => (
                  <Button
                    type="button"
                    variant="ghost"
                    key={conversation.id}
                    aria-current={
                      conversation.id === activeConversationId
                        ? 'page'
                        : undefined
                    }
                    onClick={() => selectConversation(conversation.id)}
                  >
                    <span>{conversation.title}</span>
                  </Button>
                ))}
                {visibleConversations.length === 0 ? (
                  <p>
                    {searchQuery ? '没有匹配的聊天' : '开始聊天后会显示在这里'}
                  </p>
                ) : null}
              </nav>
            ) : null}
          </section>

          <footer className="sw-ai-sidebar-account">
            <a href={accountHref}>
              <span className="sw-ai-account-avatar" aria-hidden="true">
                <SunIcon name="user" size="sm" />
              </span>
              <span className="sw-ai-account-copy">
                <strong>{accountLabel}</strong>
                <small>
                  {isAuthenticated ? '账号已同步' : '登录后同步聊天'}
                </small>
              </span>
              <SunIcon name="settings" size="sm" />
            </a>
          </footer>

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
        </div>
      }
    >
      <main
        className="sw-ai-workspace"
        inert={isMobile && sidebarOpen ? true : undefined}
      >
        <header className="sw-ai-toolbar">
          <div className="sw-ai-mode-switch sw-ai-centered">
            <Button type="button" variant="ghost" aria-current="page">
              聊天
            </Button>
            <a href="/canvas">工作</a>
          </div>
          <Button
            type="button"
            size="icon-lg"
            variant="ghost"
            className="sw-ai-new-chat-top"
            aria-label="开始新对话"
            title="开始新对话"
            onClick={startFreshConversation}
          >
            <SunIcon name="message-circle" />
          </Button>
        </header>

        {messages.length === 0 ? (
          <section className="sw-ai-home" aria-labelledby="sw-ai-home-title">
            <div className="sw-ai-home-inner sw-ai-centered">
              <h1 id="sw-ai-home-title">今天有什么计划？</h1>
              <div className="sw-ai-home-composer">{renderComposer()}</div>
              <div className="sw-ai-suggestions" aria-label="建议问题">
                {suggestedPrompts.map((suggestion) => (
                  <Button
                    key={suggestion.text}
                    type="button"
                    variant="ghost"
                    onClick={() =>
                      composerRef.current?.setQuestion(suggestion.text)
                    }
                  >
                    <SunIcon name={suggestion.icon} />
                    <span>{suggestion.text}</span>
                  </Button>
                ))}
              </div>
              {renderError()}
            </div>
          </section>
        ) : (
          <>
            <section className="sw-ai-transcript" aria-live="polite">
              <div className="sw-ai-transcript-inner sw-ai-centered">
                {messages.map((message) => (
                  <AiMessageView
                    key={message.id}
                    message={message}
                    renderers={renderers}
                    onEdit={onEditMessage}
                    onRegenerate={onRegenerate}
                    onFeedback={onFeedback}
                  />
                ))}
                {renderError()}
              </div>
            </section>
            <div className="sw-ai-composer-wrap">
              {renderComposer()}
              <small>AI 可能会出错，请核对重要信息。</small>
            </div>
          </>
        )}
      </main>
      <AiProviderSettings
        open={settingsOpen}
        providers={enabledProviders}
        profiles={providerProfiles}
        onOpenChange={setSettingsOpen}
        onSave={onSaveProvider}
      />
    </SunChatShell>
  )
}
