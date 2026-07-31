import type { ReactNode } from 'react'

export type ComposerNoticeTone = 'neutral' | 'warning' | 'error'

interface ComposerNoticeProps {
  children: ReactNode
  role: 'alert' | 'status'
  tone?: ComposerNoticeTone
}

export function ComposerNotice({
  children,
  role,
  tone = 'neutral',
}: ComposerNoticeProps) {
  return (
    <div
      className={`sw-ai-composer__notice sw-ai-composer__notice--${tone}`}
      role={role}
    >
      {children}
    </div>
  )
}
