import { useEffect, useRef, useState } from 'react'
import { SunChatShell } from '@sun-world/ui/chat-shell'
import { SunIcon } from '@sun-world/icons/react'
import { useViewportWidth } from '@/shared/browser/viewport'
import { AI_PROVIDER_OPTIONS } from '../api'
import { useAiChat } from '../composables/useAiChat'
import { AiComposer } from '../ui/AiComposer'
import { AiConversationSidebar } from '../ui/AiConversationSidebar'
import { AiMessageStream } from '../ui/AiMessageStream'
import './ai.css'

const DEFAULT_SIDEBAR_WIDTH = 288

function readSidebarWidth() {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_SIDEBAR_WIDTH
    return (
      Number(localStorage.getItem('sun-world-ai-sidebar-width')) ||
      DEFAULT_SIDEBAR_WIDTH
    )
  } catch {
    return DEFAULT_SIDEBAR_WIDTH
  }
}

function persistSidebarWidth(width: number) {
  try {
    if (typeof localStorage !== 'undefined')
      localStorage.setItem('sun-world-ai-sidebar-width', String(width))
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function AigcPage() {
  const chat = useAiChat()
  const viewportWidth = useViewportWidth()
  const [collapsed, setCollapsed] = useState(viewportWidth <= 720)
  const [width, setWidth] = useState(readSidebarWidth)
  const drag = useRef<{ pointerId: number; width: number } | null>(null)

  useEffect(() => {
    if (viewportWidth <= 720) setCollapsed(true)
  }, [viewportWidth])

  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    drag.current = { pointerId: event.pointerId, width }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const resize = (event: React.PointerEvent) => {
    if (drag.current?.pointerId !== event.pointerId) return
    const nextWidth = Math.min(380, Math.max(232, event.clientX))
    drag.current.width = nextWidth
    setWidth(nextWidth)
  }
  const stopResize = (event: React.PointerEvent) => {
    if (drag.current?.pointerId !== event.pointerId) return
    persistSidebarWidth(drag.current.width)
    event.currentTarget.releasePointerCapture(event.pointerId)
    drag.current = null
  }
  return (
    <SunChatShell
      ariaLabel="Sun World AI chat"
      sidebarCollapsed={collapsed}
      sidebarWidth={width}
      rail={
        collapsed ? (
          <button
            className="toggle-sidebar"
            onClick={() => setCollapsed(false)}
            aria-label="显示侧边栏"
          >
            <SunIcon name="panel-left-open" />
          </button>
        ) : null
      }
      sidebar={
        <>
          <AiConversationSidebar
            conversations={chat.conversations}
            activeId={chat.activeConversationId}
            onSelect={chat.selectConversation}
            onNew={chat.startConversation}
          />
          <button
            className="resize-handle"
            onPointerDown={startResize}
            onPointerMove={resize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
            aria-label="调整侧边栏宽度"
          />
        </>
      }
    >
      <main className="chat-workspace">
        <div className="model-chip">{AI_PROVIDER_OPTIONS[0]?.name}</div>
        {chat.errorMessage ? <p role="alert">{chat.errorMessage}</p> : null}
        <AiMessageStream messages={chat.activeMessages} />
        <AiComposer
          loading={chat.isSending}
          onSend={chat.sendMessage}
          onAbort={chat.abort}
        />
      </main>
    </SunChatShell>
  )
}
export default AigcPage
