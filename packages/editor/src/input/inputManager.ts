import { SWEditor } from "../editor"

/**
 * InputManager
 */
export class InputManager {
  private editor: SWEditor

  public modifiers = {
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    space: false,
  }

  constructor(editor: SWEditor) {
    this.editor = editor

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }

  private onKeyDown = (e: KeyboardEvent) => {
    this.updateModifiers(e, true)

    if (e.ctrlKey && ['s', 'S'].includes(e.key)) e.preventDefault()
    if (e.code === 'Space') e.preventDefault()

    this.editor.getToolManager()?.getActiveTool()?.onKeyDown?.(e, this.modifiers)
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.updateModifiers(e, false)

    this.editor.getToolManager()?.getActiveTool()?.onKeyUp?.(e, this.modifiers)
  }

  private updateModifiers(e: KeyboardEvent, active: boolean) {
    if (e.key === 'Shift') this.modifiers.shift = active
    if (e.key === 'Alt') this.modifiers.alt = active
    if (e.key === 'Control') this.modifiers.ctrl = active
    if (e.metaKey) this.modifiers.meta = active
    if (e.code === 'Space') this.modifiers.space = active
  }
}
