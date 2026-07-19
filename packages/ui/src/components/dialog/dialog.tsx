import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

import { cn } from '../../lib/cn'
import '../../styles/base.css'
import './dialog.css'

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
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>
        {typeof trigger === 'string' ? (
          <button type="button">{trigger}</button>
        ) : (
          trigger
        )}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn('sun-dialog__overlay', overlayClassName)}
        />
        <DialogPrimitive.Content
          className={cn('sun-dialog__content', contentClassName)}
        >
          <DialogPrimitive.Title>{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description>
              {description}
            </DialogPrimitive.Description>
          ) : null}
          {children}
          <DialogPrimitive.Close asChild>
            <button type="button" aria-label="Close dialog">
              ×
            </button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
