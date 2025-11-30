import { SWEditor } from '@/editor'

/**
 * 🟦 InputManager (键盘输入与修饰键管理器)
 * ---------------------------------------------------------------------
 *
 * **概述 (Overview):**
 * InputManager 是所有键盘交互的中央处理器。它将原始的浏览器键盘事件
 * 抽象为应用程序可以理解的状态和命令。
 *
 * **核心职责 (Core Responsibilities):**
 * 1. **全局事件监听:**
 * - 监听 `window` 或 `document` 上的 `keydown` 和 `keyup` 事件。
 * - 阻止浏览器默认行为，避免干扰（例如阻止浏览器处理 Ctrl+S）。
 *
 * 2. **修饰键状态维护:**
 * - 实时维护以下修饰键的布尔状态：
 * `Shift`, `Alt`, `Ctrl`, `Meta` (Cmd), 和 `Space` (空格键)。
 * - 提供统一的 API 供外部查询这些键的状态（例如 `input.isShiftDown`）。
 *
 * 3. **全局快捷键执行:**
 * - 识别并拦截应用程序级别的快捷键（如 Ctrl+Z, Ctrl+S, Delete, 方向键）。
 * - 将热键意图转化为 Command，并派发给 `CommandManager` 执行。
 *
 * 4. **工具交互通知:**
 * - 当 `Shift`/`Alt`/`Space` 等修饰键的状态发生变化时，立即通知 `ToolManager`。
 * - 用于更新工具行为或切换临时工具（例如：按下 Shift 约束比例）。
 *
 * **限制与范围 (Constraints & Scope):**
 * - 🚫 **仅处理键盘:** 本管理器严格忽略鼠标、触摸或其他指针事件。
 * - 🚫 **无渲染操作:** 不直接修改 Canvas DOM 或进行绘图。其输出是状态更新或命令触发。
 *
 * @class InputManager
 */
export class InputManager {
  /**
   * 编辑器实例引用
   */
  private editor: SWEditor

  /**
   * 修饰键状态对象，记录各个修饰键的按下状态
   */
  public modifiers = {
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    space: false,
  }

  /**
   * 构造函数
   * @param editor 编辑器实例
   */
  constructor(editor: SWEditor) {
    this.editor = editor

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  /**
   * 销毁方法，移除事件监听器
   */
  destroy() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
  }

  /**
   * 键盘按下事件处理函数
   * @param e 键盘事件对象
   */
  private onKeyDown = (e: KeyboardEvent) => {
    this.updateModifiers(e, true)

    // 阻止一些默认行为
    if (e.ctrlKey && ['s', 'S'].includes(e.key)) e.preventDefault()
    if (e.code === 'Space') e.preventDefault()

    // 通知当前 Tool
    this.editor.toolManager?.activeTool?.onKeyDown?.(e, this.modifiers)

    // 如果快捷键被 CommandManager 捕获，就不再继续
    if (this.editor.commandManager?.handleKeyCommand(e)) {
      return
    }
  }

  /**
   * 键盘释放事件处理函数
   * @param e 键盘事件对象
   */
  private onKeyUp = (e: KeyboardEvent) => {
    this.updateModifiers(e, false)

    // 通知当前 Tool
    this.editor.toolManager?.activeTool?.onKeyUp?.(e, this.modifiers)
  }

  /**
   * 更新修饰键状态
   * @param e 键盘事件对象
   * @param active 修饰键是否处于激活状态
   */
  private updateModifiers(e: KeyboardEvent, active: boolean) {
    if (e.key === 'Shift') this.modifiers.shift = active
    if (e.key === 'Alt') this.modifiers.alt = active
    if (e.key === 'Control') this.modifiers.ctrl = active
    if (e.metaKey) this.modifiers.meta = active
    if (e.code === 'Space') this.modifiers.space = active
  }
}
