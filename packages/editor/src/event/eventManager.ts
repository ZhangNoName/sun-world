import type { SWEditor } from '../editor'
import type { InputBindingConfig } from '../types/keybinding.type'
import { InputBindingManager } from './keyBindingManager'
import { InputController } from './inputController'

export class EventManager {
  private readonly inputBindingManager: InputBindingManager
  private readonly inputController: InputController
  private disposed = false

  constructor(
    private readonly editor: SWEditor,
    inputBindingConfig?: Partial<InputBindingConfig>
  ) {
    this.inputBindingManager = new InputBindingManager(
      editor,
      inputBindingConfig
    )
    this.inputController = new InputController({
      canvas: editor.getCanvas(),
      keyboardTarget: window,
      onInput: this.handleInput,
    })
    this.registerDefaultHandlers()
  }

  getInputBindingManager(): InputBindingManager {
    return this.inputBindingManager
  }

  getInputController(): InputController {
    return this.inputController
  }

  destroy(): void {
    if (this.disposed) return
    this.disposed = true
    this.inputController.dispose()
    this.inputBindingManager.destroy()
  }

  private handleInput = (event: Event): void => {
    if (
      event instanceof KeyboardEvent &&
      this.inputController.isEditableTarget(event.target)
    ) {
      return
    }

    const bindingHandled = this.inputBindingManager.handleInputEvent(event)
    const activeTool = this.editor.getToolManager()?.getActiveTool()
    if (bindingHandled) return

    switch (event.type) {
      case 'pointerdown':
        activeTool?.onMouseDown?.(event as PointerEvent)
        break
      case 'pointermove':
        activeTool?.onMouseMove?.(event as PointerEvent)
        break
      case 'pointerup':
      case 'pointercancel':
        activeTool?.onMouseUp?.(event as PointerEvent)
        break
      case 'wheel':
        activeTool?.onWheel?.(event as WheelEvent)
        break
      case 'keydown':
        activeTool?.onKeyDown?.(
          event as KeyboardEvent,
          this.inputController.state
        )
        break
      case 'keyup':
        activeTool?.onKeyUp?.(
          event as KeyboardEvent,
          this.inputController.state
        )
        break
      case 'contextmenu':
        event.preventDefault()
        break
    }
  }

  private registerDefaultHandlers(): void {
    const manager = this.inputBindingManager
    manager.addBinding({
      id: 'copy',
      inputs: {
        common: {
          input: { ctrlKey: true, keyCode: 'c' },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '复制',
      action: () => undefined,
    })
    manager.addBinding({
      id: 'wheel-zoom',
      inputs: {
        common: {
          input: { ctrlKey: true },
          eventType: 'wheel',
        },
      },
      preventDefault: true,
      description: '滚轮缩放',
      action: (event: Event) => {
        const wheel = event as WheelEvent
        this.editor.changZoomAt(
          wheel.deltaY < 0 ? 1 : -1,
          wheel.offsetX,
          wheel.offsetY
        )
      },
    })
    manager.addBinding({
      id: 'undo',
      inputs: {
        win: {
          input: { ctrlKey: true, shiftKey: false, keyCode: 'z' },
          eventType: 'keydown',
        },
        mac: {
          input: { metaKey: true, shiftKey: false, keyCode: 'z' },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '撤销',
      action: () => this.editor.undo(),
    })
    manager.addBinding({
      id: 'redo',
      inputs: {
        win: {
          input: { ctrlKey: true, shiftKey: true, keyCode: 'z' },
          eventType: 'keydown',
        },
        mac: {
          input: { metaKey: true, shiftKey: true, keyCode: 'z' },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '重做',
      action: () => this.editor.redo(),
    })
    manager.addBinding({
      id: 'redo-windows',
      inputs: {
        win: {
          input: { ctrlKey: true, keyCode: 'y' },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '重做',
      action: () => this.editor.redo(),
    })
    manager.addBinding({
      id: 'delete',
      inputs: {
        common: {
          input: { keyCode: 'Delete' },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '删除',
      action: () => this.editor.deleteSelectedElement(),
    })
    manager.addBinding({
      id: 'backspace',
      inputs: {
        common: {
          input: { keyCode: 'Backspace' },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '删除',
      action: () => this.editor.deleteSelectedElement(),
    })
    manager.addBinding({
      id: 'save',
      inputs: {
        common: {
          input: { keyCode: 's', ctrlKey: true },
          eventType: 'keydown',
        },
      },
      preventDefault: true,
      description: '保存',
      action: () => this.editor.save(),
    })
  }
}
