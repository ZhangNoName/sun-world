import { SWEditor } from '../editor'
import { transformer } from '../transformer/transformer'
import { KeyBindingManager } from './keyBindingManager'
import { KeyBindingConfig } from '../types/keybinding.type'

// 🟧 EventManager（鼠标 + 键盘 + Canvas 事件管理）

// 负责：

// canvas 上的鼠标事件（mousedown / mousemove / mouseup）

// contextmenu（右键）

// wheel（滚轮缩放/滚动）

// pointer events

// 键盘事件和按键绑定

// 坐标转换（屏幕坐标 → 画布坐标）
export class EventManager {
  private ctrl: boolean = false
  private shift: boolean = false
  private alt: boolean = false
  private meta: boolean = false
  private space: boolean = false

  private keyBindingManager: KeyBindingManager

  constructor(
    private editor: SWEditor,
    keyBindingConfig?: Partial<KeyBindingConfig>
  ) {
    const canvas = editor.getCanvas()

    // 初始化按键绑定管理器
    this.keyBindingManager = new KeyBindingManager(editor, keyBindingConfig)

    // 鼠标事件监听
    canvas.addEventListener('mousedown', this.handleMouseDown)
    canvas.addEventListener('mousemove', this.handleMouseMove)
    canvas.addEventListener('mouseup', this.handleMouseUp)

    // 键盘事件监听
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)

    // 注册默认的按键绑定处理器
    this.registerDefaultHandlers()
  }

  handleMouseDown = (e: MouseEvent) => {
    // 传递原始事件，让tool自己处理坐标转换
    this.editor.toolManager.activeTool?.onMouseDown(e)
  }

  handleMouseMove = (e: MouseEvent) => {
    // 传递原始事件，让tool自己处理坐标转换
    this.editor.toolManager.activeTool?.onMouseMove(e)
  }

  handleMouseUp = (e: MouseEvent) => {
    // 传递原始事件，让tool自己处理坐标转换
    this.editor.toolManager.activeTool?.onMouseUp(e)
  }

  handleKeyDown = (e: KeyboardEvent) => {
    this.keyBindingManager.handleKeyEvent(e)
  }

  handleKeyUp = (e: KeyboardEvent) => {
    this.keyBindingManager.handleKeyEvent(e)
  }

  /**
   * 注册默认的按键绑定处理器
   */
  private registerDefaultHandlers() {
    // 复制
    this.keyBindingManager.registerHandler('copy', (binding, event) => {
      console.log('执行复制操作')
      // 这里可以调用editor的复制方法
      // this.editor.copy()
    })

    // 粘贴
    this.keyBindingManager.registerHandler('paste', (binding, event) => {
      console.log('执行粘贴操作')
      // this.editor.paste()
    })

    // 剪切
    this.keyBindingManager.registerHandler('cut', (binding, event) => {
      console.log('执行剪切操作')
      // this.editor.cut()
    })

    // 撤销
    this.keyBindingManager.registerHandler('undo', (binding, event) => {
      console.log('执行撤销操作')
      // this.editor.undo()
    })

    // 重做
    this.keyBindingManager.registerHandler('redo', (binding, event) => {
      console.log('执行重做操作')
      // this.editor.redo()
    })

    // 保存
    this.keyBindingManager.registerHandler('save', (binding, event) => {
      console.log('执行保存操作')
      // this.editor.save()
    })

    // 全选
    this.keyBindingManager.registerHandler('select-all', (binding, event) => {
      console.log('执行全选操作')
      // this.editor.selectAll()
    })

    // 删除
    this.keyBindingManager.registerHandler('delete', (binding, event) => {
      console.log('执行删除操作')
      // this.editor.delete()
    })

    // 退格删除
    this.keyBindingManager.registerHandler('backspace', (binding, event) => {
      console.log('执行退格删除操作')
      // this.editor.backspace()
    })
  }
}
