import type { CSSProperties, ReactNode } from 'react'

import { cn } from '../../lib/cn'
import '../../styles/base.css'
import './chat-shell.css'

export interface SunChatShellProps {
  sidebarWidth?: number
  sidebarCollapsed?: boolean
  ariaLabel?: string
  rail?: ReactNode
  sidebar?: ReactNode
  floating?: ReactNode
  children?: ReactNode
}

export function SunChatShell({
  sidebarWidth = 280,
  sidebarCollapsed = false,
  ariaLabel = 'Chat workspace',
  rail,
  sidebar,
  floating,
  children,
}: SunChatShellProps) {
  const style = {
    '--sun-chat-sidebar-width': `${sidebarWidth}px`,
  } as CSSProperties
  return (
    <section
      data-sun-chat-shell
      className={cn(
        'sun-chat-shell',
        sidebarCollapsed && 'sun-chat-shell--collapsed'
      )}
      style={style}
      aria-label={ariaLabel}
    >
      {rail ? <div className="sun-chat-shell__rail">{rail}</div> : null}
      {!sidebarCollapsed && sidebar ? (
        <aside className="sun-chat-shell__sidebar">{sidebar}</aside>
      ) : null}
      <div className="sun-chat-shell__main">{children}</div>
      {floating ? (
        <div className="sun-chat-shell__floating">{floating}</div>
      ) : null}
    </section>
  )
}
