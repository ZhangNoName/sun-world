import type { ComponentProps } from 'react'

import { Label } from '@sun-world/base-ui/label'
import { cn } from '../../lib/cn'
import '../../styles/base.css'

export function SunLabel({
  className,
  ...props
}: ComponentProps<typeof Label>) {
  return <Label className={cn('sun-ui-label', className)} {...props} />
}
