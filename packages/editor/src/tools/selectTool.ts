import { BaseElement } from '@/elements/baseElement.class'
import { BaseTool, ToolContext, ToolName } from '../types/tools.type'
import ViewportState from '@/viewport/viewport'

export default class SelectTool extends BaseTool {
  name: ToolName = 'select'
  private isPanning = false
  private lastX = 0
  private lastY = 0
  private viewport: ViewportState
  private dragging = false
  private selectedEl: BaseElement | null = null
  constructor(ctx: ToolContext) {
    super(ctx)
    this.viewport = ctx.viewport
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
    // 点击命中检测
    const hit = elements.hitTest(canvasPos.x, canvasPos.y)
    this.selectedEl = elements.getSelectedElement() ?? null

    if (this.selectedEl) {
      this.lastX = e.clientX
      this.lastY = e.clientY

      this.dragging = true
    }

    this.ctx.render(true)
  }
  onMouseMove(e: MouseEvent): void {
    if (!this.dragging || !this.selectedEl) return

    // 鼠标移动距离
    const dx = e.clientX - this.lastX
    const dy = e.clientY - this.lastY
    this.lastX = e.clientX
    this.lastY = e.clientY

    // 更新 viewport
    this.selectedEl.move(dx, dy)
    this.ctx.render()

    // console.log('DragTool.onMouseMove', dx, dy)
  }
  onMouseUp(): void {
    console.log('SelectTool.onMouseUp')
    this.dragging = false
    this.ctx.render(true)
  }
  activate(): void {
    console.log('SelectTool.activate')
  }
  deactivate(): void {
    console.log('SelectTool.deactivate')
  }
}
