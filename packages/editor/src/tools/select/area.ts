import { BaseTool, ToolContext, ToolName } from '../../types/tools.type'
import ViewportState from '../../viewport/viewport'

export class AreaTool extends BaseTool {
  name: ToolName = 'area'
  private isPanning = false
  private startX = 0
  private startY = 0
  private curX = 0
  private curY = 0
  private viewport: ViewportState
  

  constructor(ctx: ToolContext) {
    super(ctx)
    this.viewport = ctx.viewport
  }
  onMouseDown(e: MouseEvent): void {
    // console.log('AreaTool.onMouseDown', e)
    this.isPanning = true
    const p = this.viewport.screenToCanvas(e.clientX, e.clientY)
    this.startX = p.x
    this.startY = p.y
    this.curX = p.x
    this.curY = p.y

    this.ctx.elements.setMarqueeRect({ x1: this.startX, y1: this.startY, x2: this.curX, y2: this.curY })
    this.ctx.render(true)
  }
  onMouseMove(e: MouseEvent): void {
    if (!this.isPanning) return
    const p = this.viewport.screenToCanvas(e.clientX, e.clientY)
    this.curX = p.x
    this.curY = p.y
    this.ctx.elements.setMarqueeRect({ x1: this.startX, y1: this.startY, x2: this.curX, y2: this.curY })
    this.ctx.render(true)
  }
  onMouseUp(): void {
    // console.log('AreaTool.onMouseUp')
    this.isPanning = false

    const rect = this.ctx.elements.getMarqueeRect()
    this.ctx.elements.clearMarqueeRect()

    if (rect) {
      const w = Math.abs(rect.x2 - rect.x1)
      const h = Math.abs(rect.y2 - rect.y1)
      // 太小认为是“空框”，不做范围选择
      if (w > 3 && h > 3) {
        this.ctx.elements.selectByMarquee(rect.x1, rect.y1, rect.x2, rect.y2)
      }
    }

    this.ctx.render(true)
  }
  onKeyDown(e: KeyboardEvent): void {
    console.log('AreaTool.onKeyDown', e)
  }
  onWheel(e: WheelEvent): void {
    console.log('AreaTool.onWheel', e)
  }
  activate(): void {
    console.log('AreaTool.activate')
  }
  deactivate(): void {
    console.log('AreaTool.deactivate')
  }
}