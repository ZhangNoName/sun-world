import type { ResizeHandleName } from '../../controlHandle/handleGeometry'
import type { ElementTransform } from '../../history/documentCommands'
import type { IBox } from '../../types/common.type'
import {
  BaseTool,
  type ToolContext,
  type ToolName,
} from '../../types/tools.type'

const MIN_SIZE = 1

export class ResizeTool extends BaseTool {
  name: ToolName = 'resize'
  private handle: ResizeHandleName = 'se'
  private initialBounds: IBox | null = null
  private initialTransforms: ElementTransform[] = []

  constructor(context: ToolContext) {
    super(context)
  }

  setHandle(handle: ResizeHandleName): void {
    this.handle = handle
  }

  onMouseDown(): void {
    this.initialBounds = this.ctx.elements.getSelectedBox()
    this.initialTransforms = this.ctx.elements.captureSelectedTransforms()
    this.ctx.elements.clearSelectedBox()
  }

  onMouseMove(event: MouseEvent): void {
    if (!this.initialBounds) return
    const point = this.ctx.viewport.screenToCanvas(event.offsetX, event.offsetY)
    const nextBounds = resizeBounds(this.initialBounds, this.handle, point)
    const transforms = scaleTransforms(
      this.initialTransforms,
      this.initialBounds,
      nextBounds
    )
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
  }
}

function resizeBounds(
  box: IBox,
  handle: ResizeHandleName,
  point: { x: number; y: number }
): IBox {
  let { minX, minY, maxX, maxY } = box
  if (handle.includes('w')) minX = Math.min(point.x, maxX - MIN_SIZE)
  if (handle.includes('e')) maxX = Math.max(point.x, minX + MIN_SIZE)
  if (handle.includes('n')) minY = Math.min(point.y, maxY - MIN_SIZE)
  if (handle.includes('s')) maxY = Math.max(point.y, minY + MIN_SIZE)
  return { minX, minY, maxX, maxY }
}

function scaleTransforms(
  transforms: readonly ElementTransform[],
  from: IBox,
  to: IBox
): ElementTransform[] {
  const fromWidth = Math.max(from.maxX - from.minX, MIN_SIZE)
  const fromHeight = Math.max(from.maxY - from.minY, MIN_SIZE)
  const scaleX = (to.maxX - to.minX) / fromWidth
  const scaleY = (to.maxY - to.minY) / fromHeight
  return transforms.map(({ id, patch }) => ({
    id,
    patch: {
      ...patch,
      x: to.minX + ((patch.x ?? from.minX) - from.minX) * scaleX,
      y: to.minY + ((patch.y ?? from.minY) - from.minY) * scaleY,
      width: Math.max((patch.width ?? 0) * scaleX, MIN_SIZE),
      height: Math.max((patch.height ?? 0) * scaleY, MIN_SIZE),
    },
  }))
}
