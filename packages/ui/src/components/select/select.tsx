import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from 'lucide-react'

import { cn } from '../../lib/cn'
import {
  CompoundLayerElementsProvider,
  composeAutoFocus,
  createCompoundContentEventState,
  handleContentDismissal,
  useCompoundContentEventBridge,
  useCompoundLayerElements,
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
      value?: string
    }>
    if (
      typeof element.props.value === 'string' &&
      element.props.children !== undefined &&
      (isSelectItemElementType(element.type) ||
        typeof element.type !== 'string')
    ) {
      labels.set(element.props.value, element.props.children)
      return
    }

    if (element.props.children !== undefined) {
      collectSelectItemLabels(element.props.children, labels)
    }
  })

  return labels
}

function isSelectItemElementType(type: unknown): boolean {
  if (type === SelectItem) return true
  if (typeof type !== 'object' || type === null || !('type' in type)) {
    return false
  }
  return isSelectItemElementType((type as { type?: unknown }).type)
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
  const layerElements = useCompoundLayerElements()
  const contentEventsRef = React.useRef(
    createCompoundContentEventState(layerElements)
  )
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
    <CompoundLayerElementsProvider value={layerElements}>
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
    </CompoundLayerElementsProvider>
  )
}

function SelectGroup(
  { className, ...props }: React.ComponentProps<typeof SelectPrimitive.Group>
) {
  return <SelectPrimitive.Group data-slot="select-group" className={cn('scroll-my-1 p-1', className)} {...props} />
}

function SelectValue({
  children,
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  const compatibilityContext = React.useContext(SelectCompatibilityContext)
  const itemLabel =
    compatibilityContext?.value === ''
      ? undefined
      : compatibilityContext?.labels.get(compatibilityContext.value)

  return (
    <SelectPrimitive.Value data-slot="select-value" className={cn('flex flex-1 text-left', className)} {...props}>
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
        "flex w-fit items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      render={render}
      {...props}
    >
      {asChild ? undefined : children}
      {asChild ? null : (
        <SelectPrimitive.Icon
          render={<ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />}
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
  ref,
  side,
  sideOffset,
  sticky,
  ...props
}: SelectContentProps) {
  const compatibilityContext = React.useContext(SelectCompatibilityContext)
  const contentRef = useCompoundContentEventBridge(
    compatibilityContext?.contentEventsRef,
    {
      onEscapeKeyDown,
      onPointerDownOutside,
    },
    ref
  )
  const getContentElement = () =>
    compatibilityContext?.contentEventsRef.current.popupElement ??
    compatibilityContext?.contentEventsRef.current.lastPopupElement ??
    null

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
        ref={contentRef}
        finalFocus={composeAutoFocus(
          finalFocus,
          onCloseAutoFocus,
          'close',
          getContentElement
        )}
        className={cn(
          'relative isolate z-50 max-h-(--available-height) w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
          className
        )}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.List
          data-slot="select-viewport"
          className="scroll-my-1 p-1"
        >
          {children}
        </SelectPrimitive.List>
        <SelectScrollDownButton />
      </SelectPrimitive.Popup>
    </SelectPrimitive.Positioner>
  )

  if (forceMount) {
    // Select.Portal has no public keep-mounted option. Positioner supports this
    // inline composition and owns the closed hidden/inert lifecycle itself.
    return content
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
      className={cn('px-1.5 py-1 text-xs text-muted-foreground', className)}
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
        "relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
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
