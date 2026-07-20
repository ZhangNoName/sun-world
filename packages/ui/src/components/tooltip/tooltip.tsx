import * as React from 'react'
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip'

import { cn } from '../../lib/cn'

const TooltipProviderConfigContext = React.createContext({
  disableHoverableContent: false,
})
const TooltipRootDelayContext = React.createContext<number | undefined>(
  undefined
)

type TooltipProviderProps = TooltipPrimitive.Provider.Props & {
  delayDuration?: number
  disableHoverableContent?: boolean
  skipDelayDuration?: number
}

function TooltipProvider({
  delayDuration = 0,
  disableHoverableContent = false,
  skipDelayDuration,
  delay,
  timeout,
  ...props
}: TooltipProviderProps) {
  return (
    <TooltipProviderConfigContext.Provider value={{ disableHoverableContent }}>
      <TooltipPrimitive.Provider
        delay={delay ?? delayDuration}
        timeout={timeout ?? skipDelayDuration}
        {...props}
      />
    </TooltipProviderConfigContext.Provider>
  )
}

type TooltipProps = Omit<
  TooltipPrimitive.Root.Props,
  'disableHoverablePopup' | 'onOpenChange'
> & {
  delayDuration?: number
  disableHoverableContent?: boolean
  onOpenChange?: (open: boolean) => void
}

function Tooltip({
  delayDuration,
  disableHoverableContent,
  onOpenChange,
  ...props
}: TooltipProps) {
  const providerConfig = React.useContext(TooltipProviderConfigContext)
  return (
    <TooltipRootDelayContext.Provider value={delayDuration}>
      <TooltipPrimitive.Root
        disableHoverablePopup={
          disableHoverableContent ?? providerConfig.disableHoverableContent
        }
        onOpenChange={(open) => onOpenChange?.(open)}
        {...props}
      />
    </TooltipRootDelayContext.Provider>
  )
}

type TooltipTriggerProps = Omit<
  React.ComponentProps<typeof TooltipPrimitive.Trigger>,
  'render'
> & { asChild?: boolean }

function TooltipTrigger({
  asChild = false,
  children,
  delay,
  ...props
}: TooltipTriggerProps) {
  const rootDelay = React.useContext(TooltipRootDelayContext)
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      delay={delay ?? rootDelay}
      render={
        asChild
          ? (React.Children.only(children) as React.ReactElement)
          : undefined
      }
      {...props}
    >
      {asChild ? undefined : children}
    </TooltipPrimitive.Trigger>
  )
}

type TooltipPositionerProps = Pick<
  TooltipPrimitive.Positioner.Props,
  | 'align'
  | 'alignOffset'
  | 'collisionBoundary'
  | 'collisionPadding'
  | 'side'
  | 'sideOffset'
  | 'sticky'
>

type TooltipContentProps = Omit<
  React.ComponentProps<typeof TooltipPrimitive.Popup>,
  keyof TooltipPositionerProps
> &
  TooltipPositionerProps & {
    avoidCollisions?: boolean
    forceMount?: boolean
  }

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  align,
  alignOffset,
  avoidCollisions = true,
  collisionBoundary,
  collisionPadding,
  forceMount,
  side,
  sticky,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal keepMounted={forceMount}>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        collisionAvoidance={
          avoidCollisions ? undefined : { side: 'none', align: 'none' }
        }
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
        side={side}
        sideOffset={sideOffset}
        sticky={sticky}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          role="tooltip"
          className={cn(
            'z-50 w-fit origin-(--transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-starting-style:animate-in data-starting-style:fade-in-0 data-starting-style:zoom-in-95',
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
