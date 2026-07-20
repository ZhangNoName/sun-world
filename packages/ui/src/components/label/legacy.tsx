import type { ComponentProps } from 'react'

import { Label } from './label'
import { cn } from '../../lib/cn'
import '../../styles/base.css'
import './label.css'

export function SunLabel({
  className,
  ...props
}: ComponentProps<typeof Label>) {
  return <Label className={cn('sun-ui-label', className)} {...props} />
}
