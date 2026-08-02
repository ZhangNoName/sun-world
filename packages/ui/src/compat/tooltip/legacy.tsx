import type { ReactElement, ReactNode } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@sun-world/base-ui/tooltip'
import '../../styles/base.css'

export function SunTooltip({
  content,
  children,
}: {
  content: ReactNode
  children: ReactElement
}) {
  return (
    <TooltipProvider delay={0}>
      <Tooltip>
        <TooltipTrigger render={children} />
        <TooltipContent className="sun-tooltip" sideOffset={4} role="tooltip">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
