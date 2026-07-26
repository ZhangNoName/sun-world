import type { ElementTransform } from '../../history/documentCommands'
import type { IBox } from '../../types/common.type'
import {
  BaseTool,
  type ToolContext,
  type ToolName,
} from '../../types/tools.type'

export class RotateTool extends BaseTool {
  name: ToolName = 'rotate'
  private initialBounds: IBox | null = null
  private initialTransforms: ElementTransform[] = []
  private initialPointerAngle = 0

  constructor(context: ToolContext) {
    super(context)
  }

  onMouseDown(event: MouseEvent): void {
    this.initialBounds = this.ctx.elements.getSelectedBox()
    this.initialTransforms = this.ctx.elements.captureSelectedTransforms()
    if (!this.initialBounds) return
    const point = this.ctx.viewport.screenToCanvas(event.offsetX, event.offsetY)
    this.initialPointerAngle = angleFromCenter(this.initialBounds, point)
    this.ctx.elements.clearSelectedBox()
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.initialBounds) return
    const point = this.ctx.viewport.screenToCanvas(event.offsetX, event.offsetY)
    const delta =
      angleFromCenter(this.initialBounds, point) - this.initialPointerAngle
    const center = boxCenter(this.initialBounds)
    const cosine = Math.cos(delta)
    const sine = Math.sin(delta)
    const transforms = this.initialTransforms.map(({ id, patch }) => {
      const x = patch.x ?? center.x
      const y = patch.y ?? center.y
      const dx = x - center.x
      const dy = y - center.y
      return {
        id,
        patch: {
          ...patch,
          x: center.x + dx * cosine - dy * sine,
          y: center.y + dx * sine + dy * cosine,
          rotation: (patch.rotation ?? 0) + delta,
        },
      }
    })
    this.ctx.elements.applyTransformPreview(transforms)
    this.ctx.render()
  }

  onMouseUp(): void {
    this.ctx.elements.commitSelectedTransforms(this.initialTransforms)
    this.reset()
    this.ctx.elements.calcSelectBox()
    this.ctx.render()
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || this.initialTransforms.length === 0) return
    this.ctx.elements.restoreTransformPreview(this.initialTransforms)
    this.reset()
    this.ctx.render()
  }

  private reset(): void {
    this.initialBounds = null
    this.initialTransforms = []
    this.initialPointerAngle = 0
  }
}

function boxCenter(box: IBox) {
  return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
}

function angleFromCenter(box: IBox, point: { x: number; y: number }): number {
  const center = boxCenter(box)
  return Math.atan2(point.y - center.y, point.x - center.x)
}
