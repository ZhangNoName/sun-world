import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

export interface SunDialogProps {
  trigger: ReactNode
  title: string
  description?: string
  children?: ReactNode
}

export function SunDialog({
  trigger,
  title,
  description,
  children,
}: SunDialogProps) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        {typeof trigger === 'string' ? (
          <button type="button">{trigger}</button>
        ) : (
          trigger
        )}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="sun-dialog__overlay" />
        <DialogPrimitive.Content className="sun-dialog__content">
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
