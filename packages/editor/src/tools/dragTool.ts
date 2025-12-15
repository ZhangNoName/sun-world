import { BaseTool, ToolContext, ToolName } from '../types/tools.type'
import ViewportState from '@/viewport/viewport'

export default class DragTool extends BaseTool {
  name: ToolName = 'drag'
  private isPanning = false
  private lastX = 0
  private lastY = 0
  private viewport: ViewportState
  constructor(ctx: ToolContext) {
    super(ctx)
    this.viewport = ctx.viewport
  }
  onWheel(e: WheelEvent): void {
    console.log('DragTool.onWheel', e)
  }
  onMouseDown(e: MouseEvent): void {
    // 只在左键按下时开始
    if (e.button !== 0) return

    this.isPanning = true

    // 记录鼠标初始位置 (屏幕坐标)
    this.lastX = e.clientX
    this.lastY = e.clientY

    console.log('DragTool.onMouseDown', e)
  }
  onMouseMove(e: MouseEvent): void {
    if (!this.isPanning) return
    // console.log('按下', e.clientX, this.lastX)
    // 鼠标移动距离
    const dx = e.clientX - this.lastX
    const dy = e.clientY - this.lastY
    this.lastX = e.clientX
    this.lastY = e.clientY

    // 更新 viewport
    this.viewport.move(dx, dy)

    // console.log('DragTool.onMouseMove', dx, dy)
  }
  onMouseUp(): void {
    console.log('DragTool.onMouseUp')
    this.isPanning = false
  }
  activate(): void {
    console.log('DragTool.activate')
  }
  deactivate(): void {
    console.log('DragTool.deactivate')
  }
}
