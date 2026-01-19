import { BaseElement } from '@/elements/baseElement.class'
import { BaseTool, ToolContext, ToolName } from '../../types/tools.type'
import ViewportState from '@/viewport/viewport'
import DragTool from './drag'
import { RotateTool } from './rotate'
import { ResizeTool } from './resize'
import { AreaTool } from './area'

export default class SelectTool extends BaseTool {
  name: ToolName = 'select'
  private isPanning = false
  private lastX = 0
  private lastY = 0
  private viewport: ViewportState
  private dragging = false
  private selectedEl: BaseElement | null = null
  private readonly DragMode: DragTool
  private readonly AreaMode: AreaTool
  private readonly ResizeMode: ResizeTool
  private readonly RotateMode: RotateTool
  private currentMode: BaseTool | null = null
  constructor(ctx: ToolContext) {
    super(ctx)
    this.viewport = ctx.viewport
    this.DragMode = new DragTool(ctx)
    this.AreaMode = new AreaTool(ctx)
    this.ResizeMode = new ResizeTool(ctx)
    this.RotateMode = new RotateTool(ctx)
  }
  onWheel(e: WheelEvent): void {
    console.log('Select.onWheel', e)
  }
  onMouseDown(e: MouseEvent): void {
    // 只在左键按下时开始
    if (e.button !== 0) return

    const { viewport, elements } = this.ctx

    // 转换屏幕坐标 → 画布坐标
    const canvasPos = viewport.screenToCanvas(e.clientX, e.clientY)
    const controlHandle = false
    const rotateHandle = false
    // 点击命中检测
    const hit = elements.hitTest(canvasPos.x, canvasPos.y)
    if (controlHandle) {
      this.currentMode = this.AreaMode
    } else if (rotateHandle) {
      this.currentMode = this.RotateMode
    } else if (hit) {
      this.currentMode = this.DragMode
    } else {
      this.currentMode = this.AreaMode
    }
    this.currentMode.onMouseDown(e)
    this.selectedEl = elements.getSelectedElement() ?? null

    if (this.selectedEl) {
      this.lastX = e.clientX
      this.lastY = e.clientY

      this.dragging = true
    }

    this.ctx.render(true)
  }
  onMouseMove(e: MouseEvent): void {
    // console.log('SelectTool.onMouseMove', e)
    if (!this.currentMode) {
      // console.warn('No current mode')
      return
    }
    this.currentMode.onMouseMove(e)
  }
  onMouseUp(): void {
    if (!this.currentMode) {
      // console.warn('No current mode')
      return
    }
    this.currentMode.onMouseUp()
    this.currentMode = null

  }
  activate(): void {
    console.log('SelectTool.activate')
  }
  deactivate(): void {
    console.log('SelectTool.deactivate')
  }
  onKeyDown(e: KeyboardEvent): void {
    console.log('SelectTool.onKeyDown', e)
  }
}
