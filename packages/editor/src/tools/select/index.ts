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
  private selectedEl: string[] = []
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
    elements.setMarqueeRect({ minX: canvasPos.x, minY: canvasPos.y, maxX: canvasPos.x, maxY: canvasPos.y })

    this.selectedEl = elements.getSelectedElement()
    console.log('选中元素', this.selectedEl.length, canvasPos.x, canvasPos.y)
    if (controlHandle) {
      this.currentMode = this.AreaMode
    } else if (rotateHandle) {
      this.currentMode = this.RotateMode
    } else if (this.selectedEl.length > 0) {
      this.currentMode = this.DragMode
    } else {
      this.currentMode = this.AreaMode
    }
    console.log('当前模式', this.currentMode?.name)
    this.currentMode.onMouseDown(e)

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
    console.log('选择工具 激活')
  }
  deactivate(): void {
    console.log('选择工具 取消')
  }
  onKeyDown(e: KeyboardEvent): void {
    console.log('SelectTool.onKeyDown', e)
  }
}
