import type { ReactNode } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@sun-world/base-ui/collapsible'

import { SwButton } from '../sw-button'

export function SwCollapsible({
  trigger,
  children,
  className,
}: {
  trigger: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <Collapsible className={className}>
      <CollapsibleTrigger render={<SwButton variant="ghost" size="sm" />}>
        {trigger}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}
