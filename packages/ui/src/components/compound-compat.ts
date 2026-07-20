import type * as React from 'react'

export type PointerDownOutsideEvent = CustomEvent<{
  originalEvent: PointerEvent
}>

export type FocusOutsideEvent = CustomEvent<{
  originalEvent: FocusEvent
}>

export type AutoFocusEventHandler = (event: Event) => void

type InteractionType = 'mouse' | 'touch' | 'pen' | 'keyboard' | ''

export type FocusTarget =
  | boolean
  | React.RefObject<HTMLElement | null>
  | ((interactionType: InteractionType) => boolean | HTMLElement | null | void)

export type CompoundContentEventHandlers = {
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onFocusOutside?: (event: FocusOutsideEvent) => void
  onInteractOutside?: (
    event: PointerDownOutsideEvent | FocusOutsideEvent
  ) => void
  onPointerDownOutside?: (event: PointerDownOutsideEvent) => void
}

export type CompoundContentEventHandlersRef = React.MutableRefObject<
  CompoundContentEventHandlers | undefined
>

type BaseOpenChangeEventDetails = {
  cancel: () => void
  event: Event
  reason: string
}

export function handleContentDismissal(
  open: boolean,
  eventDetails: BaseOpenChangeEventDetails,
  handlers: CompoundContentEventHandlers | undefined
) {
  if (open || !handlers) return false

  if (eventDetails.reason === 'escape-key') {
    const event = eventDetails.event as KeyboardEvent
    handlers.onEscapeKeyDown?.(event)
    if (event.defaultPrevented) {
      eventDetails.cancel()
      return true
    }
    return false
  }

  if (eventDetails.reason === 'outside-press') {
    const event = new CustomEvent('dismissableLayer.pointerDownOutside', {
      cancelable: true,
      detail: { originalEvent: eventDetails.event as PointerEvent },
    })
    handlers.onPointerDownOutside?.(event)
    handlers.onInteractOutside?.(event)
    if (event.defaultPrevented) {
      eventDetails.cancel()
      return true
    }
    return false
  }

  if (eventDetails.reason === 'focus-out') {
    const event = new CustomEvent('dismissableLayer.focusOutside', {
      cancelable: true,
      detail: { originalEvent: eventDetails.event as FocusEvent },
    })
    handlers.onFocusOutside?.(event)
    handlers.onInteractOutside?.(event)
    if (event.defaultPrevented) {
      eventDetails.cancel()
      return true
    }
  }

  return false
}

export function createAutoFocusEvent(type: 'open' | 'close') {
  return new Event(
    type === 'open'
      ? 'focusScope.autoFocusOnMount'
      : 'focusScope.autoFocusOnUnmount',
    { cancelable: true }
  )
}

export function composeAutoFocus(
  focus: FocusTarget | undefined,
  handler: AutoFocusEventHandler | undefined,
  type: 'open' | 'close'
): FocusTarget | undefined {
  if (!handler) return focus

  return (interactionType) => {
    const event = createAutoFocusEvent(type)
    handler(event)
    if (event.defaultPrevented) return false
    if (typeof focus === 'function') return focus(interactionType)
    if (typeof focus === 'object') return focus.current
    return focus ?? true
  }
}
