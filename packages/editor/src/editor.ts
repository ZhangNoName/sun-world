import type { BaseConfig } from './config'
import { BaseElement } from './elements/baseElement.class'
import { ElementStore } from './elements/elementStore'
import { EventManager } from './event/eventManager'
import { InputBindingManager } from './event/keyBindingManager'
import { InputManager } from './input/inputManager'
import { CanvasRenderer } from './render/render'
import { Rule } from './support/rules'
import DragTool from './tools/dragTool'
import { RectTool } from './tools/reactTools'
import { ToolManager } from './tools/tools'
import { Transformer } from './transformer/transformer'
import { InputBindingConfig, MODIFIERS } from './types/keybinding.type'
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
  inputBindingConfig?: Partial<InputBindingConfig>
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
  private eventManager: EventManager
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
    this.viewportState.setOffset(options.offsetX ?? 0, options.offsetY ?? 0)
    this._id = getUUID()

    // 2. 实例化核心模块，并进行依赖注入
    this.renderer = new CanvasRenderer(
      options.containerElement,
      this.viewportState,
      this.elementStore
    )

    // 创建标尺并设置到渲染器中
    this.rule = new Rule(this.renderer.ctx, this.viewportState)
    this.rule.setViewportChangeCallback(() => this.renderer.render())
    this.renderer.setRule(this.rule)

    // 首次渲染（包含标尺）
    this.renderer.render()

    // 初始化事件管理器（包含输入绑定）
    this.eventManager = new EventManager(this, options.inputBindingConfig)

    // 注册工具
    this.toolManager = new ToolManager({
      input: this.inputManager,
      viewport: this.viewportState,
      elements: this.elementStore,
      render: debounce((isDragging?: boolean) => this.renderer.render(isDragging), 0),
    })
    // 默认激活选择工具
    this.toolManager.activateTool('drag')
    this.viewportState.on(() => this.renderer.render())

    // 注意：事件处理已由 EventManager 统一管理，不需要在这里重复绑定
    // this.bindEvents(options.containerElement)
    this.inputEvents = new InputManager(this)
  }
  // id，只读
  get id() {
    return this._id
  }
  // 已移除：事件处理已由 EventManager 统一管理
  // private bindEvents(el: HTMLDivElement) {
  //   el.addEventListener('mousedown', (e) => {
  //     const p = this.transformer.toCanvas(e)
  //     this.toolManager.getActiveTool()?.onMouseDown?.(e)
  //   })

  //   el.addEventListener('mousemove', (e) => {
  //     const p = this.transformer.toCanvas(e)
  //     this.toolManager.getActiveTool()?.onMouseMove?.(e)
  //   })
  //   el.addEventListener('mouseup', (e) => {
  //     const p = this.transformer.toCanvas(e)
  //     this.toolManager.getActiveTool()?.onMouseUp?.(e)
  //   })
  // }

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
  /**
   * 获取工具管理器
   */
  public getToolManager(): ToolManager {
    return this.toolManager
  }
  /**
   * 获取按键绑定管理器
   */
  public getKeyBindingManager(): InputBindingManager {
    return this.eventManager.getInputBindingManager()
  }

  /**
   * 添加自定义按键绑定
   */
  public addKeyBinding(bindingId: string, binding: any) {
    this.getKeyBindingManager().addBinding(binding)
  }

  /**
   * 注册按键绑定处理器
   */
  public registerKeyHandler(bindingId: string, handler: any) {
    this.getKeyBindingManager().registerHandler(bindingId, handler)
  }

  public changZoom(delta: number) {
    this.viewportState.zoom(delta)
  }

  /**
   * 在指定屏幕位置进行缩放，保持该位置在画布坐标系中不变
   * @param delta 缩放增量
   * @param screenX 屏幕 X 坐标
   * @param screenY 屏幕 Y 坐标
   */
  public changZoomAt(delta: number, screenX: number, screenY: number) {
    this.viewportState.zoomAt(delta, screenX, screenY)
  }
  get zoom() {
    return this.viewportState.transform.scale
  }
  public onZoomChange(cb: (zoom: number) => void) {
    this.viewportState.on(() => {
      cb(this.viewportState.scale)
    })
  }

  // 销毁方法
  public destroy() {
    this.renderer.destroy()
    this.eventManager.getInputBindingManager().destroy()
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
  public elementStoreChanged(cb: (elements: BaseElement[]) => void) {
    this.elementStore.onElementsChange(cb)
  }
}
