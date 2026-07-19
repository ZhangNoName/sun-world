import * as LabelPrimitive from '@radix-ui/react-label'
import type { ComponentProps } from 'react'

import { cn } from '../../lib/cn'
import '../../styles/base.css'
import './label.css'

export function SunLabel({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root className={cn('sun-ui-label', className)} {...props} />
  )
}
