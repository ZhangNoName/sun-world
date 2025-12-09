import type { BaseConfig } from './config'
import { ElementStore } from './elements/elementStore'
import { InputManager } from './input/inputManager'
import { CanvasRenderer } from './render/render'
import { Rule } from './support/rules'
import DragTool from './tools/dragTool'
import { RectTool } from './tools/reactTools'
import { ToolManager } from './tools/tools'
import { Transformer } from './transformer/transformer'
import { ToolName } from './types/tools.type'
import { debounce, getUUID } from './utils/common'
import ViewportState from './viewport/viewport'

export interface IEditorOptions {
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
  private inputManager = new InputManager(this)
  private toolManager: ToolManager
  private transformer = new Transformer()
  private rule: Rule
  private inputEvents
  constructor(options: IEditorOptions) {
    // console.log('Initializing SWEditor with options*********:  ', options)
    // console.log('App Version:-------------- ***', this.appVersion)
    // console.log('User Preference**************: ', options.userPreference)
    // console.log('User Config**************: ', options.offsetY)
    // 1. 实例化核心状态 (唯一数据源)
    this.viewportState = new ViewportState()
    // this.editorState = new EditorState()

    // 2. 实例化核心模块，并进行依赖注入
    this.renderer = new CanvasRenderer(
      options.containerElement,
      this.viewportState,
      this.elementStore
    )

    this._id = getUUID()

    // 注册工具
    this.toolManager = new ToolManager({
      input: this.inputManager,
      viewport: this.viewportState,
      elements: this.elementStore,
      render: debounce(() => this.renderer.render(), 0),
    })
    // 默认激活选择工具（你之后会写）
    this.toolManager.activateTool('drag')
    this.viewportState.on(() => this.renderer.render())

    this.bindEvents(options.containerElement)
    this.inputEvents = new InputManager(this)
    this.rule = new Rule(this.renderer.ctx, this.viewportState)
  }
  // id，只读
  get id() {
    return this._id
  }
  private bindEvents(el: HTMLDivElement) {
    el.addEventListener('mousedown', (e) => {
      const p = this.transformer.toCanvas(e)
      this.toolManager.getActiveTool()?.onMouseDown?.(e)
    })

    el.addEventListener('mousemove', (e) => {
      const p = this.transformer.toCanvas(e)
      this.toolManager.getActiveTool()?.onMouseMove?.(e)
    })
    el.addEventListener('mouseup', (e) => {
      const p = this.transformer.toCanvas(e)
      this.toolManager.getActiveTool()?.onMouseUp?.(e)
    })
  }

  public setTool(name: ToolName) {
    this.toolManager.activateTool(name)
  }
  /**
   * 获取所有工具列表
   * @returns 返回工具管理器中的所有工具集合
   */
  public getTools() {
    return this.toolManager.getTools()
  }
  // 销毁方法
  public destroy() {
    this.renderer.destroy()
    // ... 清理其他模块和事件监听器
  }
  public getCanvas() {
    return this.renderer.canvasElement
  }
  public toolChanged(cb: () => void) {
    this.toolManager.on(() => {
      cb()
    })
  }
  public getActiveToolName() {
    return this.toolManager.getActiveToolName()
  }
}
