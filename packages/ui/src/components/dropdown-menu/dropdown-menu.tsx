import * as React from 'react'
import { Menu as DropdownMenuPrimitive } from '@base-ui/react/menu'
import { CheckIcon, ChevronRightIcon, CircleIcon } from 'lucide-react'

import { cn } from '../../lib/cn'
import {
  composeAutoFocus,
  handleContentDismissal,
  type AutoFocusEventHandler,
  type CompoundContentEventHandlers,
  type CompoundContentEventHandlersRef,
} from '../compound-compat'

type DropdownMenuCompatibilityContextValue = {
  contentEventsRef: CompoundContentEventHandlersRef
  selectionCanceledRef: React.MutableRefObject<boolean>
}

const DropdownMenuCompatibilityContext =
  React.createContext<DropdownMenuCompatibilityContextValue | null>(null)

function handleDropdownMenuOpenChange(
  open: boolean,
  eventDetails: DropdownMenuPrimitive.Root.ChangeEventDetails,
  selectionCanceledRef: React.MutableRefObject<boolean>,
  onOpenChange: ((open: boolean) => void) | undefined
) {
  const selectionCanceled = selectionCanceledRef.current
  selectionCanceledRef.current = false

  if (!open && eventDetails.reason === 'item-press' && selectionCanceled) {
    eventDetails.cancel()
    return
  }

  onOpenChange?.(open)
}

type DropdownMenuProps = Omit<
  DropdownMenuPrimitive.Root.Props,
  'onOpenChange'
> & {
  onOpenChange?: (open: boolean) => void
}

function DropdownMenu({ onOpenChange, ...props }: DropdownMenuProps) {
  const contentEventsRef = React.useRef<
    CompoundContentEventHandlers | undefined
  >(undefined)
  const selectionCanceledRef = React.useRef(false)
  const contextValue = React.useMemo(
    () => ({ contentEventsRef, selectionCanceledRef }),
    []
  )

  return (
    <DropdownMenuCompatibilityContext.Provider value={contextValue}>
      <DropdownMenuPrimitive.Root
        {...props}
        onOpenChange={(open, eventDetails) => {
          if (
            handleContentDismissal(open, eventDetails, contentEventsRef.current)
          ) {
            return
          }
          handleDropdownMenuOpenChange(
            open,
            eventDetails,
            selectionCanceledRef,
            onOpenChange
          )
        }}
      />
    </DropdownMenuCompatibilityContext.Provider>
  )
}

type DropdownMenuPortalProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.Portal>,
  'keepMounted'
> & {
  forceMount?: boolean
  keepMounted?: boolean
}

function DropdownMenuPortal({
  forceMount,
  keepMounted,
  ...props
}: DropdownMenuPortalProps) {
  return (
    <DropdownMenuPrimitive.Portal
      data-slot="dropdown-menu-portal"
      keepMounted={keepMounted ?? forceMount}
      {...props}
    />
  )
}

type DropdownMenuTriggerProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>,
  'render'
> & { asChild?: boolean }

function DropdownMenuTrigger({
  asChild = false,
  children,
  ...props
}: DropdownMenuTriggerProps) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      render={
        asChild
          ? (React.Children.only(children) as React.ReactElement)
          : undefined
      }
      {...props}
    >
      {asChild ? undefined : children}
    </DropdownMenuPrimitive.Trigger>
  )
}

type DropdownMenuPositionerProps = Pick<
  DropdownMenuPrimitive.Positioner.Props,
  | 'align'
  | 'alignOffset'
  | 'collisionBoundary'
  | 'collisionPadding'
  | 'side'
  | 'sideOffset'
  | 'sticky'
>

type DropdownMenuContentProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.Popup>,
  keyof DropdownMenuPositionerProps
> &
  DropdownMenuPositionerProps &
  CompoundContentEventHandlers & {
    avoidCollisions?: boolean
    forceMount?: boolean
    onCloseAutoFocus?: AutoFocusEventHandler
  }

function DropdownMenuContent({
  className,
  sideOffset = 4,
  align,
  alignOffset,
  avoidCollisions = true,
  collisionBoundary,
  collisionPadding,
  finalFocus,
  forceMount,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onFocusOutside,
  onInteractOutside,
  onPointerDownOutside,
  side,
  sticky,
  ...props
}: DropdownMenuContentProps) {
  const compatibilityContext = React.useContext(
    DropdownMenuCompatibilityContext
  )
  if (compatibilityContext) {
    compatibilityContext.contentEventsRef.current = {
      onEscapeKeyDown,
      onFocusOutside,
      onInteractOutside,
      onPointerDownOutside,
    }
  }

  return (
    <DropdownMenuPortal forceMount={forceMount}>
      <DropdownMenuPrimitive.Positioner
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
        <DropdownMenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          finalFocus={composeAutoFocus(finalFocus, onCloseAutoFocus, 'close')}
          className={cn(
            'z-50 max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-starting-style:animate-in data-starting-style:fade-in-0 data-starting-style:zoom-in-95',
            className
          )}
          {...props}
        />
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPortal>
  )
}

function DropdownMenuGroup(
  props: React.ComponentProps<typeof DropdownMenuPrimitive.Group>
) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

type MenuSelectHandler = (event: Event) => void

function dispatchMenuSelect(
  event: React.MouseEvent<HTMLElement>,
  onClick: React.MouseEventHandler<HTMLElement> | undefined,
  onSelect: MenuSelectHandler | undefined,
  selectionCanceledRef: React.MutableRefObject<boolean> | undefined
) {
  onClick?.(event)
  const selectEvent = new CustomEvent('menu.itemSelect', {
    bubbles: true,
    cancelable: true,
  })
  if (onSelect) {
    event.currentTarget.addEventListener(
      'menu.itemSelect',
      (customEvent) => onSelect(customEvent),
      { once: true }
    )
  }
  event.currentTarget.dispatchEvent(selectEvent)
  if (selectEvent.defaultPrevented && selectionCanceledRef) {
    selectionCanceledRef.current = true
  }
}

type DropdownMenuItemProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.Item>,
  'onClick'
> & {
  inset?: boolean
  onClick?: React.MouseEventHandler<HTMLElement>
  onSelect?: MenuSelectHandler
  variant?: 'default' | 'destructive'
}

function DropdownMenuItem({
  className,
  inset,
  onClick,
  onSelect,
  variant = 'default',
  ...props
}: DropdownMenuItemProps) {
  const compatibilityContext = React.useContext(
    DropdownMenuCompatibilityContext
  )

  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive!",
        className
      )}
      onClick={(event) =>
        dispatchMenuSelect(
          event,
          onClick,
          onSelect,
          compatibilityContext?.selectionCanceledRef
        )
      }
      {...props}
    />
  )
}

type DropdownMenuCheckboxItemProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>,
  'checked' | 'onCheckedChange' | 'onClick'
> & {
  checked?: boolean | 'indeterminate'
  onCheckedChange?: (checked: boolean) => void
  onClick?: React.MouseEventHandler<HTMLElement>
  onSelect?: MenuSelectHandler
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onCheckedChange,
  onClick,
  onSelect,
  ...props
}: DropdownMenuCheckboxItemProps) {
  const compatibilityContext = React.useContext(
    DropdownMenuCompatibilityContext
  )
  const isIndeterminate = checked === 'indeterminate'
  const compatibilityStateProps = isIndeterminate
    ? {
        'aria-checked': 'mixed' as const,
        'data-indeterminate': '',
        'data-state': 'indeterminate',
      }
    : checked === undefined
      ? {}
      : {
          'aria-checked': checked,
          'data-state': checked ? 'checked' : 'unchecked',
        }

  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={isIndeterminate ? false : checked}
      closeOnClick
      {...compatibilityStateProps}
      onCheckedChange={(nextChecked) => onCheckedChange?.(nextChecked)}
      onClick={(event) =>
        dispatchMenuSelect(
          event,
          onClick,
          onSelect,
          compatibilityContext?.selectionCanceledRef
        )
      }
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.CheckboxItemIndicator
          keepMounted={isIndeterminate}
        >
          <CheckIcon className="size-4" />
        </DropdownMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

type DropdownMenuRadioGroupProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
  'onValueChange'
> & {
  onValueChange?: (value: string) => void
}

function DropdownMenuRadioGroup({
  onValueChange,
  ...props
}: DropdownMenuRadioGroupProps) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      onValueChange={(value) => onValueChange?.(String(value))}
      {...props}
    />
  )
}

type DropdownMenuRadioItemProps = Omit<
  React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>,
  'onClick'
> & {
  onClick?: React.MouseEventHandler<HTMLElement>
  onSelect?: MenuSelectHandler
}

function DropdownMenuRadioItem({
  className,
  children,
  onClick,
  onSelect,
  ...props
}: DropdownMenuRadioItemProps) {
  const compatibilityContext = React.useContext(
    DropdownMenuCompatibilityContext
  )

  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      closeOnClick
      onClick={(event) =>
        dispatchMenuSelect(
          event,
          onClick,
          onSelect,
          compatibilityContext?.selectionCanceledRef
        )
      }
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.RadioItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </DropdownMenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.GroupLabel> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'px-2 py-1.5 text-sm font-medium data-[inset]:pl-8',
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        'ml-auto text-xs tracking-widest text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

type DropdownMenuSubProps = Omit<
  DropdownMenuPrimitive.SubmenuRoot.Props,
  'onOpenChange'
> & {
  onOpenChange?: (open: boolean) => void
}

function DropdownMenuSub({ onOpenChange, ...props }: DropdownMenuSubProps) {
  const contentEventsRef = React.useRef<
    CompoundContentEventHandlers | undefined
  >(undefined)
  const selectionCanceledRef = React.useRef(false)
  const contextValue = React.useMemo(
    () => ({ contentEventsRef, selectionCanceledRef }),
    []
  )

  return (
    <DropdownMenuCompatibilityContext.Provider value={contextValue}>
      <DropdownMenuPrimitive.SubmenuRoot
        {...props}
        onOpenChange={(open, eventDetails) => {
          if (
            handleContentDismissal(open, eventDetails, contentEventsRef.current)
          ) {
            return
          }
          handleDropdownMenuOpenChange(
            open,
            eventDetails,
            selectionCanceledRef,
            onOpenChange
          )
        }}
      />
    </DropdownMenuCompatibilityContext.Provider>
  )
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubmenuTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[inset]:pl-8 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </DropdownMenuPrimitive.SubmenuTrigger>
  )
}

type DropdownMenuSubContentProps = DropdownMenuContentProps

function DropdownMenuSubContent({
  className,
  side = 'right',
  sideOffset = 0,
  align = 'start',
  alignOffset,
  avoidCollisions = true,
  collisionBoundary,
  collisionPadding,
  finalFocus,
  forceMount,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onFocusOutside,
  onInteractOutside,
  onPointerDownOutside,
  sticky,
  ...props
}: DropdownMenuSubContentProps) {
  const compatibilityContext = React.useContext(
    DropdownMenuCompatibilityContext
  )
  if (compatibilityContext) {
    compatibilityContext.contentEventsRef.current = {
      onEscapeKeyDown,
      onFocusOutside,
      onInteractOutside,
      onPointerDownOutside,
    }
  }

  return (
    <DropdownMenuPortal forceMount={forceMount}>
      <DropdownMenuPrimitive.Positioner
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
        <DropdownMenuPrimitive.Popup
          data-slot="dropdown-menu-sub-content"
          finalFocus={composeAutoFocus(finalFocus, onCloseAutoFocus, 'close')}
          className={cn(
            'z-50 min-w-[8rem] origin-(--transform-origin) overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-ending-style:animate-out data-ending-style:fade-out-0 data-ending-style:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-starting-style:animate-in data-starting-style:fade-in-0 data-starting-style:zoom-in-95',
            className
          )}
          {...props}
        />
      </DropdownMenuPrimitive.Positioner>
    </DropdownMenuPortal>
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
