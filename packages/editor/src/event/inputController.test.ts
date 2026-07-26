import { InputController } from './inputController'

describe('InputController', () => {
  it('stops forwarding events after idempotent disposal', () => {
    const canvas = document.createElement('canvas')
    const received: string[] = []
    const controller = new InputController({
      canvas,
      keyboardTarget: window,
      onInput: (event) => received.push(event.type),
    })

    canvas.dispatchEvent(new Event('pointerdown'))
    controller.dispose()
    controller.dispose()
    canvas.dispatchEvent(new Event('pointerdown'))

    expect(received).toEqual(['pointerdown'])
  })

  it('tracks modifiers and pointer buttons through one input state', () => {
    const canvas = document.createElement('canvas')
    const controller = new InputController({ canvas, keyboardTarget: window })

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Shift', shiftKey: true })
    )
    canvas.dispatchEvent(
      new MouseEvent('pointerdown', {
        button: 0,
        ctrlKey: true,
        shiftKey: true,
      })
    )

    expect(controller.state).toMatchObject({
      shift: true,
      ctrl: true,
      primaryPointer: true,
    })

    canvas.dispatchEvent(new MouseEvent('pointerup', { button: 0 }))
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Shift' }))

    expect(controller.state).toMatchObject({
      shift: false,
      primaryPointer: false,
    })
    controller.dispose()
  })

  it('identifies editable shortcut targets', () => {
    const canvas = document.createElement('canvas')
    const controller = new InputController({ canvas, keyboardTarget: window })
    const input = document.createElement('input')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'

    expect(controller.isEditableTarget(input)).toBe(true)
    expect(controller.isEditableTarget(editable)).toBe(true)
    expect(controller.isEditableTarget(canvas)).toBe(false)
    controller.dispose()
  })

  it('captures an active pointer and releases it on completion', () => {
    const canvas = document.createElement('canvas')
    const setPointerCapture = vi.fn()
    const releasePointerCapture = vi.fn()
    Object.assign(canvas, { setPointerCapture, releasePointerCapture })
    const controller = new InputController({ canvas, keyboardTarget: window })
    const down = new Event('pointerdown')
    const up = new Event('pointerup')
    Object.defineProperty(down, 'pointerId', { value: 7 })
    Object.defineProperty(up, 'pointerId', { value: 7 })

    canvas.dispatchEvent(down)
    canvas.dispatchEvent(up)

    expect(setPointerCapture).toHaveBeenCalledWith(7)
    expect(releasePointerCapture).toHaveBeenCalledWith(7)
    controller.dispose()
  })
})
