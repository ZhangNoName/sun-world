import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())
HTMLElement.prototype.scrollIntoView ??= () => undefined
HTMLElement.prototype.hasPointerCapture ??= () => false
HTMLElement.prototype.releasePointerCapture ??= () => undefined
HTMLElement.prototype.setPointerCapture ??= () => undefined
if (!globalThis.PointerEvent) {
  globalThis.PointerEvent =
    class PointerEvent extends MouseEvent {} as typeof PointerEvent
}
globalThis.ResizeObserver ??= class implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
