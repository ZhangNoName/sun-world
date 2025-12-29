import { SWEditor } from '../editor'
import { transformer } from '../transformer/transformer'
import { InputBindingManager } from './keyBindingManager'
import { InputBindingConfig } from '../types/keybinding.type'

// 🟧 EventManager（鼠标 + 键盘 + Canvas 事件管理）

// 负责：

// canvas 上的鼠标事件（mousedown / mousemove / mouseup）

// contextmenu（右键）

// wheel（滚轮缩放/滚动）

// pointer events

// 键盘事件和按键绑定

// 坐标转换（屏幕坐标 → 画布坐标）
export class EventManager {
  private inputBindingManager: InputBindingManager

  constructor(
    private editor: SWEditor,
    inputBindingConfig?: Partial<InputBindingConfig>
  ) {
    const canvas = editor.getCanvas()

    // 初始化输入绑定管理器（统一管理键盘和鼠标）
    this.inputBindingManager = new InputBindingManager(
      editor,
      inputBindingConfig
    )

    // 鼠标事件监听
    canvas.addEventListener('mousedown', this.handleMouseDown)
    canvas.addEventListener('mousemove', this.handleMouseMove)
    canvas.addEventListener('mouseup', this.handleMouseUp)
    canvas.addEventListener('wheel', this.handleWheel)

    // 右键菜单阻止默认行为
    canvas.addEventListener('contextmenu', (e) => {
      // 让 InputBindingManager 处理右键事件
      if (this.inputBindingManager.handleInputEvent(e)) {
        return
      }
      e.preventDefault() // 如果没有匹配的绑定，则阻止默认右键菜单
    })

    // 键盘事件监听
    window.addEventListener('keydown', this.handleKeyDown)
    window.addEventListener('keyup', this.handleKeyUp)

    // 注册默认的输入绑定处理器
    this.registerDefaultHandlers()
  }

  handleMouseDown = (e: MouseEvent) => {
    // 先让 InputBindingManager 处理输入绑定
    const bindingHandled = this.inputBindingManager.handleInputEvent(e)

    // 如果没有匹配的绑定，则传递给工具处理
    if (!bindingHandled) {
      this.editor.toolManager.activeTool?.onMouseDown?.(e)
    }
  }

  handleMouseMove = (e: MouseEvent) => {
    // 鼠标移动主要由工具处理，但也要更新输入状态
    this.inputBindingManager.handleInputEvent(e)
    this.editor.toolManager.activeTool?.onMouseMove?.(e)
  }

  handleMouseUp = (e: MouseEvent) => {
    // 先让 InputBindingManager 处理输入绑定
    const bindingHandled = this.inputBindingManager.handleInputEvent(e)

    // 如果没有匹配的绑定，则传递给工具处理
    if (!bindingHandled) {
      this.editor.toolManager.activeTool?.onMouseUp?.(e)
    }
  }

  handleWheel = (e: WheelEvent) => {
    // 滚轮事件主要由 InputBindingManager 处理
    const bindingHandled = this.inputBindingManager.handleInputEvent(e)

    // 如果没有匹配的绑定，可以传递给工具处理缩放等
    if (!bindingHandled) {
      this.editor.toolManager.activeTool?.onWheel?.(e)
    }
  }

  handleKeyDown = (e: KeyboardEvent) => {
    this.inputBindingManager.handleInputEvent(e)
  }

  handleKeyUp = (e: KeyboardEvent) => {
    this.inputBindingManager.handleInputEvent(e)
  }

  /**
   * 注册默认的输入绑定处理器
   */
  private registerDefaultHandlers() {
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
      action: (event, binding) => {
        console.log('执行复制操作')
        // this.editor.copy()
      },
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
      action: (event: Event, binding) => {
        const e = event as WheelEvent
        const delta = e.deltaY < 0 ? 1 : -1

        // 获取鼠标相对于 canvas 的位置（屏幕坐标）
        const canvas = this.editor.getCanvas()
        const rect = canvas.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top

        // 使用 zoomAt 方法，在鼠标位置缩放并保持鼠标指向的画布位置不变
        this.editor.changZoomAt(delta, mx, my)
      },
    })
  }
}
