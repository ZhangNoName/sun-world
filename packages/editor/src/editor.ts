import type { BaseConfig } from './config'
import { CanvasRenderer } from './render/render'
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

  constructor(options: IEditorOptions) {
    // 1. 实例化核心状态 (唯一数据源)
    this.viewportState = new ViewportState()
    // this.editorState = new EditorState()

    // 2. 实例化核心模块，并进行依赖注入
    this.renderer = new CanvasRenderer(
      options.containerElement,
      this.viewportState
    )

    this._id = getUUID()
  }
  // id，只读
  get id() {
    return this._id
  }

  // 销毁方法
  public destroy() {
    this.renderer.destroy()
    // ... 清理其他模块和事件监听器
  }
}
