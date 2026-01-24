import { BaseTool, ToolContext, ToolName } from '../../types/tools.type'
import ViewportState from '../../viewport/viewport'

export class AreaTool extends BaseTool {
  name: ToolName = 'area'
  private isPanning = false
  private startX = 0
  private startY = 0
  private viewport: ViewportState


  constructor(ctx: ToolContext) {
    super(ctx)
    this.viewport = ctx.viewport
  }
  onMouseDown(e: MouseEvent): void {
    console.log('区域选择 鼠标按下')
    // console.log('AreaTool.onMouseDown', e)
    this.isPanning = true
    const p = this.viewport.screenToCanvas(e.offsetX, e.offsetY)
    this.startX = p.x
    this.startY = p.y

    this.ctx.elements.setMarqueeRect({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y })
    this.ctx.render()
  }
  onMouseMove(e: MouseEvent): void {
    // console.log('区域选择 鼠标移动')
    if (!this.isPanning) return
    const p = this.viewport.screenToCanvas(e.offsetX, e.offsetY)

    const minX = Math.min(this.startX, p.x)
    const maxX = Math.max(this.startX, p.x)
    const minY = Math.min(this.startY, p.y)
    const maxY = Math.max(this.startY, p.y)
    this.ctx.elements.setMarqueeRect({ minX, minY, maxX, maxY })
    this.ctx.render()
  }
  onMouseUp(): void {
    console.log('区域选择 取消')
    this.isPanning = false
    this.ctx.elements.clearMarqueeRect()

    this.ctx.render()
  }
  onKeyDown(e: KeyboardEvent): void {
    console.log('区域选择 按键', e)
  }
  onWheel(e: WheelEvent): void {
    console.log('区域选择 滚轮', e)
  }
  activate(): void {
    console.log('区域选择 激活')
  }
  deactivate(): void {
    console.log('区域选择 取消')
  }
}