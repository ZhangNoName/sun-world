import type { ReactNode } from 'react'

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './dialog'
import { cn } from '../../lib/cn'
import '../../styles/base.css'

export interface SunDialogProps {
  trigger: ReactNode
  title: string
  description?: string
  children?: ReactNode
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
  const triggerIsElement = typeof trigger !== 'string'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild={triggerIsElement}>{trigger}</DialogTrigger>
      <DialogContent
        className={cn('sun-dialog__content', contentClassName)}
        overlayClassName={cn('sun-dialog__overlay', overlayClassName)}
        showCloseButton={false}
      >
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
        {children}
        <DialogClose asChild>
          <button type="button" aria-label="Close dialog">
            ×
          </button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
