import * as React from 'react'

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

type OutsideInteractionKind = 'focus' | 'pointer'

type ObservedOutsideInteraction = {
  defaultPrevented: boolean
  kind: OutsideInteractionKind
  target: EventTarget | null
  timestamp: number
}

export type CompoundContentEventState = {
  handlers: CompoundContentEventHandlers | undefined
  insideElements: Set<HTMLElement>
  lastPopupElement: HTMLElement | null
  observedOutsideEvents: WeakMap<object, boolean>
  popupElement: HTMLElement | null
  recentOutsideInteraction: ObservedOutsideInteraction | null
}

export type CompoundContentEventHandlersRef =
  React.MutableRefObject<CompoundContentEventState>

type BaseOpenChangeEventDetails = {
  cancel: () => void
  event: Event
  reason: string
}

const CompoundLayerElementsContext =
  React.createContext<Set<HTMLElement> | null>(null)

export function useCompoundLayerElements() {
  const parentElements = React.useContext(CompoundLayerElementsContext)
  const ownElements = React.useMemo(() => new Set<HTMLElement>(), [])
  return parentElements ?? ownElements
}

export function CompoundLayerElementsProvider({
  children,
  value,
}: React.PropsWithChildren<{ value: Set<HTMLElement> }>) {
  return React.createElement(
    CompoundLayerElementsContext.Provider,
    { value },
    children
  )
}

export function createCompoundContentEventState(
  insideElements = new Set<HTMLElement>()
): CompoundContentEventState {
  return {
    handlers: undefined,
    insideElements,
    lastPopupElement: null,
    observedOutsideEvents: new WeakMap(),
    popupElement: null,
    recentOutsideInteraction: null,
  }
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value)
  } else if (ref) {
    ref.current = value
  }
}

function getOutsideTarget(originalEvent: Event, kind: OutsideInteractionKind) {
  if (
    kind === 'focus' &&
    originalEvent instanceof FocusEvent &&
    (originalEvent.type === 'focusout' || originalEvent.type === 'blur')
  ) {
    return originalEvent.relatedTarget ?? originalEvent.target
  }
  return originalEvent.target
}

function isEventTarget(value: unknown): value is EventTarget {
  return (
    value !== null &&
    typeof value === 'object' &&
    'addEventListener' in value &&
    'dispatchEvent' in value
  )
}

function dispatchOutsideInteraction(
  kind: OutsideInteractionKind,
  originalEvent: Event,
  handlers: CompoundContentEventHandlers,
  fallbackTarget: HTMLElement | null
) {
  const originalTarget = getOutsideTarget(originalEvent, kind)
  const target = isEventTarget(originalTarget) ? originalTarget : fallbackTarget
  if (!target) return false

  const type =
    kind === 'pointer'
      ? 'dismissableLayer.pointerDownOutside'
      : 'dismissableLayer.focusOutside'
  const event = new CustomEvent(type, {
    bubbles: false,
    cancelable: true,
    detail: { originalEvent },
  }) as PointerDownOutsideEvent | FocusOutsideEvent
  const listener: EventListener = (dispatchedEvent) => {
    const outsideEvent = dispatchedEvent as
      | PointerDownOutsideEvent
      | FocusOutsideEvent
    if (kind === 'pointer') {
      handlers.onPointerDownOutside?.(outsideEvent as PointerDownOutsideEvent)
    } else {
      handlers.onFocusOutside?.(outsideEvent as FocusOutsideEvent)
    }
    handlers.onInteractOutside?.(outsideEvent)
  }

  target.addEventListener(type, listener, { once: true })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

function resolveObservedInteraction(
  state: CompoundContentEventState,
  kind: OutsideInteractionKind,
  originalEvent: Event
) {
  if (state.observedOutsideEvents.has(originalEvent)) {
    return state.observedOutsideEvents.get(originalEvent)
  }

  const recent = state.recentOutsideInteraction
  const target = getOutsideTarget(originalEvent, kind)
  if (
    recent?.kind === kind &&
    recent.target === target &&
    Date.now() - recent.timestamp < 1000
  ) {
    return recent.defaultPrevented
  }

  return undefined
}

export function handleContentDismissal(
  open: boolean,
  eventDetails: BaseOpenChangeEventDetails,
  state: CompoundContentEventState
) {
  const handlers = state.handlers
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

  const kind =
    eventDetails.reason === 'outside-press'
      ? 'pointer'
      : eventDetails.reason === 'focus-out'
        ? 'focus'
        : undefined
  if (!kind) return false

  const observedDefaultPrevented = resolveObservedInteraction(
    state,
    kind,
    eventDetails.event
  )
  const defaultPrevented =
    observedDefaultPrevented ??
    dispatchOutsideInteraction(
      kind,
      eventDetails.event,
      handlers,
      state.popupElement ?? state.lastPopupElement
    )
  if (defaultPrevented) {
    eventDetails.cancel()
    return true
  }

  return false
}

export function createAutoFocusEvent(type: 'open' | 'close') {
  return new Event(
    type === 'open'
      ? 'focusScope.autoFocusOnMount'
      : 'focusScope.autoFocusOnUnmount',
    { bubbles: false, cancelable: true }
  )
}

export function dispatchAutoFocusEvent(
  target: HTMLElement | null,
  handler: AutoFocusEventHandler | undefined,
  type: 'open' | 'close'
) {
  if (!target || !handler) return undefined

  const event = createAutoFocusEvent(type)
  const listener: EventListener = (dispatchedEvent) => handler(dispatchedEvent)
  target.addEventListener(event.type, listener, { once: true })
  target.dispatchEvent(event)
  return event
}

export function composeAutoFocus(
  focus: FocusTarget | undefined,
  handler: AutoFocusEventHandler | undefined,
  type: 'open' | 'close',
  getTarget: () => HTMLElement | null
): FocusTarget | undefined {
  if (!handler) return focus

  return (interactionType) => {
    const event = dispatchAutoFocusEvent(getTarget(), handler, type)
    if (event?.defaultPrevented) return false
    if (typeof focus === 'function') return focus(interactionType)
    if (typeof focus === 'object') return focus.current
    return focus ?? true
  }
}

export function useCompoundContentEventBridge(
  stateRef: CompoundContentEventHandlersRef | undefined,
  handlers: CompoundContentEventHandlers,
  forwardedRef: React.Ref<HTMLElement> | undefined
) {
  if (stateRef) stateRef.current.handlers = handlers

  const setPopupElement = React.useCallback(
    (element: HTMLElement | null) => {
      const previousElement = stateRef?.current.popupElement

      if (stateRef) {
        if (previousElement) {
          stateRef.current.insideElements.delete(previousElement)
        }
        stateRef.current.popupElement = element
        if (element) {
          stateRef.current.insideElements.add(element)
          stateRef.current.lastPopupElement = element
        }
      }
      setRef(forwardedRef, element)
    },
    [forwardedRef, stateRef]
  )

  React.useLayoutEffect(() => {
    if (!stateRef) return undefined

    const state = stateRef.current
    const popup = state.popupElement
    const ownerDocument = popup?.ownerDocument ?? document
    const observe = (
      kind: OutsideInteractionKind,
      originalEvent: PointerEvent | FocusEvent
    ) => {
      const popupElement = state.popupElement
      const target = getOutsideTarget(originalEvent, kind)
      const insideLayer =
        target instanceof Node &&
        Array.from(state.insideElements).some((element) =>
          element.contains(target)
        )
      if (!popupElement?.hasAttribute('data-open') || insideLayer) {
        return
      }

      const currentHandlers = state.handlers
      if (!currentHandlers) return
      const hasRelevantHandler =
        kind === 'pointer'
          ? currentHandlers.onPointerDownOutside ||
            currentHandlers.onInteractOutside
          : currentHandlers.onFocusOutside || currentHandlers.onInteractOutside
      if (!hasRelevantHandler) return

      const defaultPrevented = dispatchOutsideInteraction(
        kind,
        originalEvent,
        currentHandlers,
        popupElement
      )
      state.observedOutsideEvents.set(originalEvent, defaultPrevented)
      state.recentOutsideInteraction = {
        defaultPrevented,
        kind,
        target,
        timestamp: Date.now(),
      }
    }
    const onPointerDown = (event: PointerEvent) => observe('pointer', event)
    const onFocusIn = (event: FocusEvent) => observe('focus', event)

    ownerDocument.addEventListener('pointerdown', onPointerDown, true)
    ownerDocument.addEventListener('focusin', onFocusIn, true)
    return () => {
      ownerDocument.removeEventListener('pointerdown', onPointerDown, true)
      ownerDocument.removeEventListener('focusin', onFocusIn, true)
    }
  }, [stateRef])

  React.useEffect(
    () => () => {
      const popup = stateRef?.current.popupElement
      if (popup) {
        stateRef?.current.insideElements.delete(popup)
      }
    },
    [stateRef]
  )

  return setPopupElement
}
