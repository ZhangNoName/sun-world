import type { SWEditor } from '../editor'
import { EventManager } from './eventManager'

function createEditorDouble() {
  const canvas = document.createElement('canvas')
  const editor = {
    getCanvas: () => canvas,
    getToolManager: () => ({ getActiveTool: () => null }),
    changZoomAt: vi.fn(),
    deleteSelectedElement: vi.fn(),
    save: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
  }
  return { canvas, editor: editor as unknown as SWEditor, methods: editor }
}

describe('EventManager editor shortcuts', () => {
  it('routes history, deletion, and save shortcuts', () => {
    const { editor, methods } = createEditorDouble()
    const events = new EventManager(editor)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true })
    )
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true })
    )
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }))
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', ctrlKey: true })
    )

    expect(methods.undo).toHaveBeenCalledTimes(1)
    expect(methods.redo).toHaveBeenCalledTimes(1)
    expect(methods.deleteSelectedElement).toHaveBeenCalledTimes(1)
    expect(methods.save).toHaveBeenCalledTimes(1)
    events.destroy()
  })

  it('does not intercept shortcuts from editable controls', () => {
    const { editor, methods } = createEditorDouble()
    const events = new EventManager(editor)
    const input = document.createElement('input')
    document.body.append(input)

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
      })
    )

    expect(methods.deleteSelectedElement).not.toHaveBeenCalled()
    events.destroy()
    input.remove()
  })
})
