import * as React from 'react'

import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@sun-world/base-ui/dialog'
import { SwDialogContent } from '../../components/sw-dialog'
import { cn } from '../../lib/cn'
import '../../styles/base.css'

export interface SunDialogProps {
  trigger: React.ReactNode
  title: string
  description?: string
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  overlayClassName?: string
  contentClassName?: string
}

export function SunDialog({
  trigger,
  title,
  description,
  children,
  open,
  onOpenChange,
  overlayClassName,
  contentClassName,
}: SunDialogProps) {
  const triggerIsElement = React.isValidElement(trigger)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={triggerIsElement ? (trigger as React.ReactElement) : undefined}
      >
        {triggerIsElement ? undefined : trigger}
      </DialogTrigger>
      <SwDialogContent
        className={cn('sun-dialog__content', contentClassName)}
        overlayClassName={cn('sun-dialog__overlay', overlayClassName)}
        showCloseButton={false}
      >
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
        {children}
        <DialogClose
          render={
            <button type="button" aria-label="Close dialog">
              ×
            </button>
          }
        />
      </SwDialogContent>
    </Dialog>
  )
}
