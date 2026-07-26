export interface InputState {
  shift: boolean
  alt: boolean
  ctrl: boolean
  meta: boolean
  space: boolean
  primaryPointer: boolean
  auxiliaryPointer: boolean
  secondaryPointer: boolean
  pointerX: number
  pointerY: number
}

export interface InputControllerOptions {
  canvas: EventTarget
  keyboardTarget?: EventTarget
  onInput?: (event: Event, state: Readonly<InputState>) => void
}

const POINTER_EVENTS = [
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
]
const CANVAS_EVENTS = [...POINTER_EVENTS, 'wheel', 'contextmenu']
const KEYBOARD_EVENTS = ['keydown', 'keyup']

export class InputController {
  public readonly state: InputState = {
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    space: false,
    primaryPointer: false,
    auxiliaryPointer: false,
    secondaryPointer: false,
    pointerX: 0,
    pointerY: 0,
  }

  private disposed = false
  private activePointerId: number | null = null
  private readonly canvas: EventTarget
  private readonly keyboardTarget: EventTarget
  private readonly onInput?: InputControllerOptions['onInput']

  constructor(options: InputControllerOptions) {
    this.canvas = options.canvas
    this.keyboardTarget = options.keyboardTarget ?? window
    this.onInput = options.onInput
    CANVAS_EVENTS.forEach((type) =>
      this.canvas.addEventListener(type, this.handleInput)
    )
    KEYBOARD_EVENTS.forEach((type) =>
      this.keyboardTarget.addEventListener(type, this.handleInput)
    )
  }

  isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    if (target.closest('input, textarea, select')) return true
    let current: Element | null = target
    while (current) {
      const contentEditable = (current as HTMLElement).contentEditable
      if (contentEditable === 'true' || contentEditable === 'plaintext-only') {
        return true
      }
      if (contentEditable === 'false') return false
      current = current.parentElement
    }
    return false
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.releaseActivePointer()
    CANVAS_EVENTS.forEach((type) =>
      this.canvas.removeEventListener(type, this.handleInput)
    )
    KEYBOARD_EVENTS.forEach((type) =>
      this.keyboardTarget.removeEventListener(type, this.handleInput)
    )
  }

  private handleInput = (event: Event): void => {
    this.updateState(event)
    this.updatePointerCapture(event)
    this.onInput?.(event, this.state)
  }

  private updatePointerCapture(event: Event): void {
    if (!('pointerId' in event)) return
    const pointerId = Number(event.pointerId)
    const canvas = this.canvas as EventTarget & {
      setPointerCapture?: (id: number) => void
      releasePointerCapture?: (id: number) => void
    }
    if (event.type === 'pointerdown') {
      this.activePointerId = pointerId
      canvas.setPointerCapture?.(pointerId)
    } else if (event.type === 'pointerup' || event.type === 'pointercancel') {
      canvas.releasePointerCapture?.(pointerId)
      if (this.activePointerId === pointerId) this.activePointerId = null
    }
  }

  private releaseActivePointer(): void {
    if (this.activePointerId === null) return
    const canvas = this.canvas as EventTarget & {
      releasePointerCapture?: (id: number) => void
    }
    canvas.releasePointerCapture?.(this.activePointerId)
    this.activePointerId = null
  }

  private updateState(event: Event): void {
    if ('shiftKey' in event) this.state.shift = Boolean(event.shiftKey)
    if ('altKey' in event) this.state.alt = Boolean(event.altKey)
    if ('ctrlKey' in event) this.state.ctrl = Boolean(event.ctrlKey)
    if ('metaKey' in event) this.state.meta = Boolean(event.metaKey)

    if (event instanceof KeyboardEvent) {
      if (event.code === 'Space' || event.key === ' ') {
        this.state.space = event.type === 'keydown'
      }
      if (event.key === 'Shift' && event.type === 'keyup')
        this.state.shift = false
      if (event.key === 'Alt' && event.type === 'keyup') this.state.alt = false
      if (event.key === 'Control' && event.type === 'keyup')
        this.state.ctrl = false
      if (event.key === 'Meta' && event.type === 'keyup')
        this.state.meta = false
      return
    }

    if ('clientX' in event) this.state.pointerX = Number(event.clientX)
    if ('clientY' in event) this.state.pointerY = Number(event.clientY)
    if (!('button' in event)) return

    const active = event.type === 'pointerdown'
    if (
      event.type !== 'pointerdown' &&
      event.type !== 'pointerup' &&
      event.type !== 'pointercancel'
    )
      return
    if (event.button === 0) this.state.primaryPointer = active
    if (event.button === 1) this.state.auxiliaryPointer = active
    if (event.button === 2) this.state.secondaryPointer = active
  }
}
