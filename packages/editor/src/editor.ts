import type { BaseConfig } from './config'
import { BaseElement } from './elements/baseElement.class'
import { ElementManager } from './elements/elementManager'
import { EventManager } from './event/eventManager'
import { InputBindingManager } from './event/keyBindingManager'
import { CanvasRenderer } from './render/render'
import { Rule } from './support/rules'
import DragTool from './tools/dragTool'
import { RectTool } from './tools/reactTools'
import { ToolManager } from './tools/tools'
import { InputBindingConfig, MODIFIERS } from './types/keybinding.type'
import { ToolName } from './types/tools.type'
import { debounce, getUUID } from './utils/common'
import ViewportState from './viewport/viewport'
import { NodeInfo } from './elements/ele.type'
import { CursorManager } from './cursor/cursorManager'
import { ControlManager } from './controlHandle/controlManager'
import type { HistoryState } from './history/command'
import type { DocumentRepository } from './persistence/documentRepository'
import { LocalStorageDocumentRepository } from './persistence/localStorageDocumentRepository'

export interface IEditorOptions {
  containerElement: HTMLDivElement
  width?: number
  height?: number
  offsetX?: number
  offsetY?: number
  showPerfMonitor?: boolean
  userPreference?: Partial<BaseConfig>
  inputBindingConfig?: Partial<InputBindingConfig>
  documentId?: string
  repository?: DocumentRepository
}

interface Events {
  destroy(): void
}

export class SWEditor {
  public readonly appVersion = 'sw-editor_0.0.0'
  private _id: string
  private viewportState: ViewportState
  private renderer: CanvasRenderer
  private elementManager = new ElementManager()
  private eventManager: EventManager
  private toolManager: ToolManager
  private cursorManager: CursorManager
  private readonly documentId: string
  private readonly repository: DocumentRepository
  public readonly ready: Promise<void>

  private rule: Rule
  private viewportCleanup: (() => void) | null = null
  private disposed = false
  constructor(options: IEditorOptions) {
    this.documentId = options.documentId ?? 'default'
    this.repository =
      options.repository ?? new LocalStorageDocumentRepository(localStorage)
    // 1. 实例化核心状态 (唯一数据源)
    this.viewportState = new ViewportState()
    // this.editorState = new EditorState()
    this._id = getUUID()

    // 2. 实例化核心模块，并进行依赖注入
    this.renderer = new CanvasRenderer(
      options.containerElement,
      this.viewportState,
      this.elementManager
    )

    // 创建标尺并设置到渲染器中
    this.rule = new Rule(this.renderer.ctx, this.viewportState)
    this.rule.setViewportChangeCallback(() => this.renderer.render())
    this.renderer.setRule(this.rule)

    // 首次渲染（包含标尺）
    this.renderer.render()

    // 初始化事件管理器（包含输入绑定）
    this.eventManager = new EventManager(this, options.inputBindingConfig)
    // 初始化光标管理器
    this.cursorManager = new CursorManager(this.getCanvas())
    // 注册工具
    this.toolManager = new ToolManager({
      input: this.eventManager.getInputController(),
      viewport: this.viewportState,
      elements: this.elementManager,
      cursor: this.cursorManager,
      render: debounce(
        (isDragging?: boolean) => this.renderer.render(isDragging),
        0
      ),
    })
    // 默认激活选择工具
    this.toolManager.activateTool('drag')
    this.viewportCleanup = this.viewportState.on(() => this.renderer.render())
    this.ready = this.elementManager
      .loadDocument(this.repository, this.documentId)
      .then(() => this.renderer.render())

    // 注意：事件处理已由 EventManager 统一管理，不需要在这里重复绑定
    // this.bindEvents(options.containerElement)
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
    return this.viewportState.scale
  }
  public onZoomChange(cb: (zoom: number) => void) {
    return this.viewportState.on(() => {
      cb(this.viewportState.scale)
    })
  }

  // 销毁方法
  public destroy() {
    if (this.disposed) return
    this.disposed = true
    this.viewportCleanup?.()
    this.viewportCleanup = null
    this.eventManager.destroy()
    this.elementManager.destroy()
    this.renderer.destroy()
  }
  public getCanvas() {
    return this.renderer.canvasElement
  }
  public toolChanged(cb: () => void) {
    return this.toolManager.on(() => {
      cb()
    })
  }
  public getActiveToolName() {
    return this.toolManager.getActiveToolName()
  }
  public elementManagerChanged(cb: (elements: BaseElement[]) => void) {
    return this.elementManager.onElementsChange(cb)
  }
  public elementTreeChanged(cb: (root: NodeInfo[]) => void) {
    return this.elementManager.onHierarchyChange(cb)
  }
  public selectElement(id: string) {
    this.elementManager.clearSelectedElement()
    this.elementManager.setSelectedElement(id)
    this.elementManager.calcSelectBox()
    this.renderer.render()
  }
  public getElementPanelAttrs(id: string) {
    const element = this.elementManager.getById(id)
    return element ? { ...element.getPanelAttrs(), name: element.name } : null
  }
  public updateElement(
    id: string,
    patch: Parameters<BaseElement['updateAttrs']>[0]
  ) {
    if (this.elementManager.updateElement(id, patch)) this.renderer.render()
  }
  public deleteElement(id: string) {
    this.elementManager.remove(id)
  }
  public deleteSelectedElement() {
    return this.elementManager.deleteSelectedElements()
  }
  public undo() {
    return this.elementManager.undo()
  }
  public redo() {
    return this.elementManager.redo()
  }
  public get canUndo() {
    return this.elementManager.canUndo
  }
  public get canRedo() {
    return this.elementManager.canRedo
  }
  public historyChanged(callback: (state: HistoryState) => void) {
    return this.elementManager.onHistoryChange(callback)
  }
  public save(): Promise<void> {
    return this.elementManager.saveDocument(this.repository, this.documentId)
  }
}
