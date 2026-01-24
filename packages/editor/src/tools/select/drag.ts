import { BaseElement } from '@/elements/baseElement.class'
import { BaseTool, ToolContext, ToolName } from '../../types/tools.type'
import ViewportState from '@/viewport/viewport'

export default class DragTool extends BaseTool {
  name: ToolName = 'drag'
  private dragging = false
  private lastX = 0
  private lastY = 0
  private viewport: ViewportState
  private selectedEl: string[] = []
  private parentId: string | null = null
  constructor(ctx: ToolContext) {
    super(ctx)
    this.viewport = ctx.viewport

  }
  onMouseMove(e: MouseEvent): void {
    // console.log('DragTool.onMouseMove', e)
    if (!this.selectedEl) return
    const { viewport, elements } = this.ctx
    const { x, y } = viewport.screenToCanvas(e.offsetX, e.offsetY)
    // elements.moveSelectedElement(canvasPos.x, canvasPos.y)
    const dx = x - this.lastX
    const dy = y - this.lastY
    this.lastX = x
    this.lastY = y

    // elements.hitTest(canvasPos.x, canvasPos.y)
    elements.hitTopExcludeSelected(x, y)
    // if (newParentId !== this.parentId) {
    //   console.log('更新----newParentId', this.parentId, newParentId)
    //   this.parentId = newParentId
    //   this.ctx.elements.moveNode(this.selectedEl.id, newParentId)
    //   this.selectedEl.parentId = newParentId
    // }

    // 将屏幕像素位移转换为画布坐标位移（父坐标系）
    const cdx = dx / this.viewport.scale
    const cdy = dy / this.viewport.scale
    elements.moveSelectedElement(cdx, cdy)
    this.ctx.render()
  }
  onMouseUp(): void {
    // console.log('DragTool.onMouseUp')
    this.selectedEl = []
    this.dragging = false
    const { viewport, elements } = this.ctx
    elements.calcSelectBox()
    this.ctx.render()

  }
  onMouseDown(e: MouseEvent): void {

    // console.log('DragTool.onMouseDown')
    // this.parentId = this.selectedEl?.parentId ?? null
    const p = this.viewport.screenToCanvas(e.offsetX, e.offsetY)
    this.lastX = p.x
    this.lastY = p.y
    this.dragging = true
    this.ctx.elements.clearSelectedBox()
  }
  onKeyDown(e: KeyboardEvent): void {
    // console.log('DragTool.onKeyDown')
  }
  onWheel(e: WheelEvent): void {
    console.log('DragTool.onWheel')
  }
  activate(): void {
    console.log('DragTool.activate')
  }
  deactivate(): void {
    console.log('DragTool.deactivate')
  }
}