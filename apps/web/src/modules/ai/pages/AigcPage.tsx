import { useEffect, useState } from 'react'
import { SunChatShell } from '@sun-world/ui/chat-shell'
import { SunIcon } from '@sun-world/icons/react'
import { AI_PROVIDER_OPTIONS } from '../api'
import { useAiChat } from '../composables/useAiChat'
import { AiComposer } from '../ui/AiComposer'
import { AiConversationSidebar } from '../ui/AiConversationSidebar'
import { AiMessageStream } from '../ui/AiMessageStream'
import './ai.css'

export function AigcPage() {
  const chat = useAiChat()
  const [collapsed, setCollapsed] = useState(window.innerWidth <= 720)
  const [width, setWidth] = useState(
    Number(localStorage.getItem('sun-world-ai-sidebar-width')) || 288
  )
  useEffect(() => {
    const resize = () => {
      if (window.innerWidth <= 720) setCollapsed(true)
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const startResize = (event: React.PointerEvent) => {
    event.preventDefault()
    let nextWidth = width
    const move = (next: PointerEvent) => {
      nextWidth = Math.min(380, Math.max(232, next.clientX))
      setWidth(nextWidth)
    }
    const stop = () => {
      localStorage.setItem('sun-world-ai-sidebar-width', String(nextWidth))
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
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
