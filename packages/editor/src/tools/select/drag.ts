import type { ElementTransform } from '../../history/documentCommands'
import { BaseTool, ToolContext, ToolName } from '../../types/tools.type'
import ViewportState from '../../viewport/viewport'
import { SystemCursor } from '../../cursor/cursorManager'

export default class DragTool extends BaseTool {
  name: ToolName = 'drag'
  private dragging = false
  private lastX = 0
  private lastY = 0
  private viewport: ViewportState
  private selectedEl: string[] = []
  private parentId: string | null = null
  private initialTransforms: ElementTransform[] = []
  constructor(ctx: ToolContext) {
    super(ctx)
    this.viewport = ctx.viewport
  }
  onMouseMove(e: MouseEvent): void {
    if (!this.selectedEl) return
    const { viewport, elements } = this.ctx
    const { x, y } = viewport.screenToCanvas(e.offsetX, e.offsetY)
    const dx = x - this.lastX
    const dy = y - this.lastY
    this.lastX = x
    this.lastY = y
    elements.moveSelectedElement(dx, dy)
    this.ctx.render()
  }
  onMouseUp(): void {
    // console.log('DragTool.onMouseUp')
    this.selectedEl = []
    this.dragging = false
    const { viewport, elements } = this.ctx
    elements.commitSelectedTransforms(this.initialTransforms)
    this.initialTransforms = []
    elements.calcSelectBox()
    this.ctx.render()
    this.ctx.cursor.setCursor(SystemCursor.Default)
  }
  onMouseDown(e: MouseEvent): void {
    this.ctx.cursor.setCursor(SystemCursor.Grabbing)
    // console.log('DragTool.onMouseDown')
    // this.parentId = this.selectedEl?.parentId ?? null
    const p = this.viewport.screenToCanvas(e.offsetX, e.offsetY)
    this.lastX = p.x
    this.lastY = p.y
    this.dragging = true
    this.initialTransforms = this.ctx.elements.captureSelectedTransforms()
    this.ctx.elements.clearSelectedBox()
  }
  onKeyDown(e: KeyboardEvent): void {
    // console.log('DragTool.onKeyDown')
  }
  onWheel(_e: WheelEvent): void {}
  activate(): void {}
  deactivate(): void {}
}
