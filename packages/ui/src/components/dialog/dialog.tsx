'use client'

import * as React from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { XIcon } from 'lucide-react'

import { cn } from '../../lib/cn'
import { Button } from '../button'
import {
  composeAutoFocus,
  handleContentDismissal,
  type AutoFocusEventHandler,
  type CompoundContentEventHandlers,
  type CompoundContentEventHandlersRef,
} from '../compound-compat'

type DialogCompatibilityContextValue = {
  contentEventsRef: CompoundContentEventHandlersRef
}

const DialogCompatibilityContext =
  React.createContext<DialogCompatibilityContextValue | null>(null)

type DialogProps = Omit<DialogPrimitive.Root.Props, 'onOpenChange'> & {
  onOpenChange?: (open: boolean) => void
}

function Dialog({ onOpenChange, ...props }: DialogProps) {
  const contentEventsRef = React.useRef<
    CompoundContentEventHandlers | undefined
  >(undefined)
  const contextValue = React.useMemo(() => ({ contentEventsRef }), [])

  return (
    <DialogCompatibilityContext.Provider value={contextValue}>
      <DialogPrimitive.Root
        {...props}
        onOpenChange={(open, eventDetails) => {
          if (
            handleContentDismissal(open, eventDetails, contentEventsRef.current)
          ) {
            return
          }
          onOpenChange?.(open)
        }}
      />
    </DialogCompatibilityContext.Provider>
  )
}

type DialogTriggerProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Trigger>,
  'render'
> & { asChild?: boolean }

function DialogTrigger({
  asChild = false,
  children,
  ...props
}: DialogTriggerProps) {
  return (
    <DialogPrimitive.Trigger
      data-slot="dialog-trigger"
      render={
        asChild
          ? (React.Children.only(children) as React.ReactElement)
          : undefined
      }
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Trigger>
  )
}

type DialogPortalProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Portal>,
  'keepMounted'
> & {
  forceMount?: boolean
  keepMounted?: boolean
}

function DialogPortal({
  forceMount,
  keepMounted,
  ...props
}: DialogPortalProps) {
  return (
    <DialogPrimitive.Portal
      data-slot="dialog-portal"
      keepMounted={keepMounted ?? forceMount}
      {...props}
    />
  )
}

type DialogCloseProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Close>,
  'render'
> & { asChild?: boolean }

function DialogClose({
  asChild = false,
  children,
  ...props
}: DialogCloseProps) {
  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      render={
        asChild
          ? (React.Children.only(children) as React.ReactElement)
          : undefined
      }
      {...props}
    >
      {asChild ? undefined : children}
    </DialogPrimitive.Close>
  )
}

type DialogOverlayProps = Omit<
  React.ComponentProps<typeof DialogPrimitive.Backdrop>,
  'forceRender'
> & {
  forceMount?: boolean
}

function DialogOverlay({
  className,
  forceMount,
  ...props
}: DialogOverlayProps) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      forceRender={forceMount}
      className={cn(
        'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-ending-style:animate-out data-ending-style:fade-out-0 data-open:animate-in data-open:fade-in-0 data-starting-style:animate-in data-starting-style:fade-in-0',
        className
      )}
      {...props}
    />
  )
}

type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Popup> &
  CompoundContentEventHandlers & {
    forceMount?: boolean
    onCloseAutoFocus?: AutoFocusEventHandler
    onOpenAutoFocus?: AutoFocusEventHandler
    showCloseButton?: boolean
    overlayClassName?: string
  }

function DialogContent({
  className,
  children,
  forceMount,
  initialFocus,
  finalFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onFocusOutside,
  onInteractOutside,
  onOpenAutoFocus,
  onPointerDownOutside,
  showCloseButton = true,
  overlayClassName,
  ...props
}: DialogContentProps) {
  const compatibilityContext = React.useContext(DialogCompatibilityContext)
  if (compatibilityContext) {
    compatibilityContext.contentEventsRef.current = {
      onEscapeKeyDown,
      onFocusOutside,
      onInteractOutside,
      onPointerDownOutside,
    }
  }

  return (
    <DialogPortal forceMount={forceMount}>
      <DialogOverlay className={overlayClassName} forceMount={forceMount} />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        initialFocus={composeAutoFocus(initialFocus, onOpenAutoFocus, 'open')}
        finalFocus={composeAutoFocus(finalFocus, onCloseAutoFocus, 'close')}
        className={cn(
          'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border bg-background p-6 shadow-lg duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-starting-style:animate-in data-starting-style:fade-in-0 data-starting-style:zoom-in-95 sm:max-w-lg',
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground data-open:bg-accent data-open:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-none font-semibold', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
