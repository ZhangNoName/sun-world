import {
  useId,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@sun-world/base-ui/tooltip'

export function SwTooltip({
  children,
  content,
  delay = 350,
  disabled,
  side,
  trackCursorAxis,
}: {
  children: ReactElement
  content: ReactNode
  delay?: number
  disabled?: boolean
  side?: ComponentProps<typeof TooltipContent>['side']
  trackCursorAxis?: ComponentProps<typeof Tooltip>['trackCursorAxis']
}) {
  const tooltipId = useId()
  return (
    <Tooltip disabled={disabled} trackCursorAxis={trackCursorAxis}>
      <TooltipTrigger
        render={children}
        delay={delay}
        aria-describedby={tooltipId}
      />
      <TooltipContent
        id={tooltipId}
        role="tooltip"
        className="sun-tooltip"
        side={side}
        sideOffset={6}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
