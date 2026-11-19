import type { ReactElement, ReactNode } from 'react'

import { SwTooltip } from '../../components/sw-tooltip'
import '../../styles/base.css'

export function SunTooltip({
  content,
  children,
}: {
  content: ReactNode
  children: ReactElement
}) {
  return (
    <SwTooltip content={content} delay={0}>
      {children}
    </SwTooltip>
  )
}
