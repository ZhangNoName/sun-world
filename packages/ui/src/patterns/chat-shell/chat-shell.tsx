import type { CSSProperties, ReactNode } from 'react'

import { cn } from '../../lib/cn'
import '../../styles/base.css'
import './chat-shell.css'

export interface SunChatShellProps {
  sidebarWidth?: number
  railWidth?: number
  sidebarCollapsed?: boolean
  ariaLabel?: string
  rail?: ReactNode
  sidebar?: ReactNode
  floating?: ReactNode
  children?: ReactNode
}

export function SunChatShell({
  sidebarWidth = 280,
  railWidth = 52,
  sidebarCollapsed = false,
  ariaLabel = 'Chat workspace',
  rail,
  sidebar,
  floating,
  children,
}: SunChatShellProps) {
  const style = {
    '--sun-chat-sidebar-width': `${sidebarWidth}px`,
    '--sun-chat-rail-width': `${railWidth}px`,
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
      {rail ? (
        <div
          className="sun-chat-shell__rail"
          aria-hidden={!sidebarCollapsed}
          inert={!sidebarCollapsed ? true : undefined}
        >
          {rail}
        </div>
      ) : null}
      {sidebar ? (
        <aside
          className="sun-chat-shell__sidebar"
          aria-hidden={sidebarCollapsed}
          inert={sidebarCollapsed ? true : undefined}
        >
          {sidebar}
        </aside>
      ) : null}
      <div className="sun-chat-shell__main">{children}</div>
      {floating ? (
        <div className="sun-chat-shell__floating">{floating}</div>
      ) : null}
    </section>
  )
}
