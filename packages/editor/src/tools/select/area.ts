import {
  BaseTool,
  type ToolContext,
  type ToolName,
} from '../../types/tools.type'

export class AreaTool extends BaseTool {
  name: ToolName = 'area'
  private active = false
  private startX = 0
  private startY = 0
  private initialSelection: string[] = []
  private selectionMode: 'replace' | 'add' | 'toggle' = 'replace'

  constructor(context: ToolContext) {
    super(context)
  }

  onMouseDown(event: MouseEvent): void {
    this.active = true
    const point = this.ctx.viewport.screenToCanvas(event.offsetX, event.offsetY)
    this.startX = point.x
    this.startY = point.y
    this.initialSelection = [...this.ctx.elements.selectedIds]
    this.selectionMode = this.ctx.input.state.shift
      ? 'add'
      : this.ctx.input.state.ctrl || this.ctx.input.state.meta
        ? 'toggle'
        : 'replace'
    this.ctx.elements.setMarqueeRect({
      minX: point.x,
      minY: point.y,
      maxX: point.x,
      maxY: point.y,
    })
    this.ctx.render()
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.active) return
    const point = this.ctx.viewport.screenToCanvas(event.offsetX, event.offsetY)
    this.ctx.elements.setMarqueeRect({
      minX: Math.min(this.startX, point.x),
      minY: Math.min(this.startY, point.y),
      maxX: Math.max(this.startX, point.x),
      maxY: Math.max(this.startY, point.y),
    })
    this.ctx.render()
  }

  onMouseUp(): void {
    if (!this.active) return
    this.active = false
    const hits = [...this.ctx.elements.selectedIds]
    if (this.selectionMode === 'add') {
      this.ctx.elements.replaceSelection([...this.initialSelection, ...hits])
    } else if (this.selectionMode === 'toggle') {
      this.ctx.elements.replaceSelection(this.initialSelection)
      this.ctx.elements.toggleSelection(hits)
    }
    this.ctx.elements.clearMarqueeRect()
    this.ctx.elements.calcSelectBox()
    this.ctx.render()
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !this.active) return
    this.active = false
    this.ctx.elements.replaceSelection(this.initialSelection)
    this.ctx.elements.clearMarqueeRect()
    this.ctx.render()
  }
}
