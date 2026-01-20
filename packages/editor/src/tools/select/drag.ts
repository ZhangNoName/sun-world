import { BaseElement } from '@/elements/baseElement.class'
import { BaseTool, ToolContext, ToolName } from '../../types/tools.type'
import ViewportState from '@/viewport/viewport'

export default class DragTool extends BaseTool {
  name: ToolName = 'drag'
  private dragging = false
  private lastX = 0
  private lastY = 0
  private viewport: ViewportState
  private selectedEl: BaseElement | null = null
  private parentId: string | null = null
  constructor(ctx: ToolContext) {
    super(ctx)
    this.viewport = ctx.viewport

  }
  onMouseMove(e: MouseEvent): void {
    // console.log('DragTool.onMouseMove', e)
    if (!this.selectedEl) return
    // console.log('DragTool.onMouseMove', this.selectedEl)
    const { viewport, elements } = this.ctx
    const canvasPos = viewport.screenToCanvas(e.clientX, e.clientY)
    // elements.hitTest(canvasPos.x, canvasPos.y)
    const newParentId = elements.hitTopExcludeSelected(canvasPos.x, canvasPos.y)
    if (newParentId !== this.parentId) {
      console.log('更新----newParentId', this.parentId, newParentId)
      this.parentId = newParentId
      this.ctx.elements.moveNode(this.selectedEl.id, newParentId)
      this.selectedEl.parentId = newParentId
    }

    // 鼠标移动距离
    const dx = e.clientX - this.lastX
    const dy = e.clientY - this.lastY
    this.lastX = e.clientX
    this.lastY = e.clientY

    // 将屏幕像素位移转换为画布坐标位移（父坐标系）
    const cdx = dx / this.viewport.transform.scale
    const cdy = dy / this.viewport.transform.scale
    this.selectedEl.move(cdx, cdy)
    this.ctx.render()
  }
  onMouseUp(): void {
    // console.log('DragTool.onMouseUp')
    this.selectedEl = null
    this.dragging = false
  }
  onMouseDown(e: MouseEvent): void {
    // console.log('DragTool.onMouseDown')
    this.selectedEl = this.ctx.elements.getSelectedElement() ?? null
    this.parentId = this.selectedEl?.parentId ?? null

    this.lastX = e.clientX
    this.lastY = e.clientY
    this.dragging = true
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