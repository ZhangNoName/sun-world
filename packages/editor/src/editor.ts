import type { BaseConfig } from './config'
import { ElementStore } from './elements/elementStore'
import { CanvasRenderer } from './render/render'
import { RectTool } from './tools/reactTools'
import { ToolManager } from './tools/tools'
import { debounce, getUUID } from './utils/common'
import { ViewportState } from './viewport/viewport'

interface IEditorOptions {
  containerElement: HTMLDivElement
  width?: number
  height?: number
  offsetX?: number
  offsetY?: number
  showPerfMonitor?: boolean
  userPreference?: Partial<BaseConfig>
}

interface Events {
  destroy(): void
}

export class SWEditor {
  public readonly appVersion = 'sw-editor_0.0.0'
  private _id: string
  private viewportState: ViewportState
  private renderer: CanvasRenderer
  private elementStore = new ElementStore()
  private toolManager = new ToolManager()

  constructor(options: IEditorOptions) {
    console.log('Initializing SWEditor with options:  ', options)
    // 1. 实例化核心状态 (唯一数据源)
    this.viewportState = new ViewportState()
    // this.editorState = new EditorState()

    // 2. 实例化核心模块，并进行依赖注入
    this.renderer = new CanvasRenderer(
      options.containerElement,
      this.viewportState
    )

    this._id = getUUID()
    this.renderer.setElementStore(this.elementStore)

    // 注册工具
    this.toolManager.registerTool(
      new RectTool(this.elementStore, this.viewportState)
    )

    // 默认激活选择工具（你之后会写）
    this.toolManager.activateTool('rect')

    this.bindEvents(options.containerElement)
  }
  // id，只读
  get id() {
    return this._id
  }
  private bindEvents(el: HTMLDivElement) {
    el.addEventListener('mousedown', (e) =>
      this.toolManager.getActiveTool()?.onMouseDown?.(e)
    )
    el.addEventListener('mousemove', (e) =>
      this.toolManager.getActiveTool()?.onMouseMove?.(e)
    )
    el.addEventListener('mouseup', (e) =>
      this.toolManager.getActiveTool()?.onMouseUp?.(e)
    )
  }

  setTool(name: string) {
    this.toolManager.activateTool(name)
  }
  // 销毁方法
  public destroy() {
    this.renderer.destroy()
    // ... 清理其他模块和事件监听器
  }
}
