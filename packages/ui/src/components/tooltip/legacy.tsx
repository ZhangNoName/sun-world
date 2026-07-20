import type { ReactElement, ReactNode } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'
import '../../styles/base.css'

export function SunTooltip({
  content,
  children,
}: {
  content: ReactNode
  children: ReactElement
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent className="sun-tooltip" sideOffset={4}>
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
