import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'
import { createPortal } from 'react-dom'

import { cn } from '../../lib/cn'
import {
  composeAutoFocus,
  handleContentDismissal,
  type AutoFocusEventHandler,
  type CompoundContentEventHandlers,
  type CompoundContentEventHandlersRef,
} from '../compound-compat'

type SelectCompatibilityContextValue = {
  contentEventsRef: CompoundContentEventHandlersRef
  labels: ReadonlyMap<string, React.ReactNode>
  open: boolean
  value: string
}

const SelectCompatibilityContext =
  React.createContext<SelectCompatibilityContextValue | null>(null)

function collectSelectItemLabels(
  children: React.ReactNode,
  labels = new Map<string, React.ReactNode>()
) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return

    const element = child as React.ReactElement<{
      children?: React.ReactNode
      value?: unknown
    }>
    if (
      element.type === SelectItem &&
      typeof element.props.value === 'string'
    ) {
      labels.set(element.props.value, element.props.children)
    }

    if (element.props.children !== undefined) {
      collectSelectItemLabels(element.props.children, labels)
    }
  })

  return labels
}

type SelectProps = Omit<
  SelectPrimitive.Root.Props<string, false>,
  'defaultValue' | 'multiple' | 'onOpenChange' | 'onValueChange' | 'value'
> & {
  defaultValue?: string
  onOpenChange?: (open: boolean) => void
  onValueChange?: (value: string) => void
  value?: string
}

function Select({
  children,
  defaultOpen,
  defaultValue,
  onOpenChange,
  onValueChange,
  open: openProp,
  value: valueProp,
  ...props
}: SelectProps) {
  const isControlled = valueProp !== undefined
  const isOpenControlled = openProp !== undefined
  const [uncontrolledValue, setUncontrolledValue] = React.useState(
    defaultValue ?? ''
  )
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    defaultOpen ?? false
  )
  const contentEventsRef = React.useRef<
    CompoundContentEventHandlers | undefined
  >(undefined)
  const value = isControlled ? valueProp : uncontrolledValue
  const open = isOpenControlled ? openProp : uncontrolledOpen
  const labels = React.useMemo(
    () => collectSelectItemLabels(children),
    [children]
  )
  const contextValue = React.useMemo(
    () => ({ contentEventsRef, labels, open, value }),
    [labels, open, value]
  )

  return (
    <SelectCompatibilityContext.Provider value={contextValue}>
      <SelectPrimitive.Root
        {...props}
        open={open}
        value={value === '' ? null : value}
        onOpenChange={(nextOpen, eventDetails) => {
          if (
            handleContentDismissal(
              nextOpen,
              eventDetails,
              contentEventsRef.current
            )
          ) {
            return
          }
          if (!isOpenControlled) setUncontrolledOpen(nextOpen)
          onOpenChange?.(nextOpen)
        }}
        onValueChange={(nextValue) => {
          if (nextValue === null) return
          if (!isControlled) setUncontrolledValue(nextValue)
          onValueChange?.(nextValue)
        }}
      >
        {children}
      </SelectPrimitive.Root>
    </SelectCompatibilityContext.Provider>
  )
}

function SelectGroup(
  props: React.ComponentProps<typeof SelectPrimitive.Group>
) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  const compatibilityContext = React.useContext(SelectCompatibilityContext)
  const itemLabel =
    compatibilityContext?.value === ''
      ? undefined
      : compatibilityContext?.labels.get(compatibilityContext.value)

  return (
    <SelectPrimitive.Value data-slot="select-value" {...props}>
      {children ?? itemLabel}
    </SelectPrimitive.Value>
  )
}

type SelectTriggerProps = Omit<
  React.ComponentProps<typeof SelectPrimitive.Trigger>,
  'render'
> & {
  asChild?: boolean
  size?: 'sm' | 'default'
}

function SelectTrigger({
  className,
  size = 'default',
  asChild = false,
  children,
  ...props
}: SelectTriggerProps) {
  const render = asChild
    ? (React.Children.only(children) as React.ReactElement)
    : undefined

  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      render={render}
      {...props}
    >
      {asChild ? undefined : children}
      {asChild ? null : (
        <SelectPrimitive.Icon
          render={<ChevronDownIcon className="size-4 opacity-50" />}
        >
          {null}
        </SelectPrimitive.Icon>
      )}
    </SelectPrimitive.Trigger>
  )
}

type SelectPositionerProps = Pick<
  SelectPrimitive.Positioner.Props,
  | 'align'
  | 'alignOffset'
  | 'collisionBoundary'
  | 'collisionPadding'
  | 'side'
  | 'sideOffset'
  | 'sticky'
>

type SelectContentProps = Omit<
  React.ComponentProps<typeof SelectPrimitive.Popup>,
  keyof SelectPositionerProps
> &
  SelectPositionerProps &
  Pick<
    CompoundContentEventHandlers,
    'onEscapeKeyDown' | 'onPointerDownOutside'
  > & {
    forceMount?: boolean
    onCloseAutoFocus?: AutoFocusEventHandler
    position?: 'item-aligned' | 'popper'
  }

function SelectContent({
  className,
  children,
  position = 'item-aligned',
  align = 'center',
  alignOffset,
  collisionBoundary,
  collisionPadding,
  finalFocus,
  forceMount,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  side,
  sideOffset,
  sticky,
  ...props
}: SelectContentProps) {
  const compatibilityContext = React.useContext(SelectCompatibilityContext)
  if (compatibilityContext) {
    compatibilityContext.contentEventsRef.current = {
      onEscapeKeyDown,
      onPointerDownOutside,
    }
  }

  const content = (
    <SelectPrimitive.Positioner
      align={align}
      alignOffset={alignOffset}
      alignItemWithTrigger={position === 'item-aligned'}
      collisionBoundary={collisionBoundary}
      collisionPadding={collisionPadding}
      side={side}
      sideOffset={sideOffset}
      sticky={sticky}
    >
      <SelectPrimitive.Popup
        data-slot="select-content"
        finalFocus={composeAutoFocus(finalFocus, onCloseAutoFocus, 'close')}
        className={cn(
          'relative z-50 max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-starting-style:animate-in data-starting-style:fade-in-0 data-starting-style:zoom-in-95',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.List
          data-slot="select-viewport"
          className={cn(
            'p-1',
            position === 'popper' &&
              'h-(--anchor-height) w-full min-w-(--anchor-width) scroll-my-1'
          )}
        >
          {children}
        </SelectPrimitive.List>
        <SelectScrollDownButton />
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  )

  if (forceMount && compatibilityContext && !compatibilityContext.open) {
    if (typeof document === 'undefined') return null
    return createPortal(
      <div data-base-ui-portal="" data-slot="select-portal">
        {content}
      </div>,
      document.body
    )
  }

  return <SelectPrimitive.Portal>{content}</SelectPrimitive.Portal>
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpArrow>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        'flex cursor-default items-center justify-center py-1',
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownArrow>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
