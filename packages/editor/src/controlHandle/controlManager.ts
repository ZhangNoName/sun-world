import type { IBox, IPoint } from '../types/common.type'
import {
  createHandleGeometry,
  hitTestHandle,
  type TransformHandleGeometry,
} from './handleGeometry'

export class ControlManager {
  private handles: TransformHandleGeometry[] = []

  constructor(private readonly context: CanvasRenderingContext2D) {}

  setBox(box: IBox, scale: number): void {
    this.handles = createHandleGeometry(box, scale)
  }

  get geometry(): readonly TransformHandleGeometry[] {
    return this.handles
  }

  hitTest(point: IPoint): TransformHandleGeometry | null {
    return hitTestHandle(this.handles, point)
  }

  render(): void {
    const context = this.context
    context.save()
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#0d99ff'
    for (const handle of this.handles) {
      context.beginPath()
      if (handle.kind === 'rotate') {
        context.arc(
          handle.center.x,
          handle.center.y,
          handle.size / 2,
          0,
          Math.PI * 2
        )
      } else {
        context.rect(
          handle.center.x - handle.size / 2,
          handle.center.y - handle.size / 2,
          handle.size,
          handle.size
        )
      }
      context.fill()
      context.stroke()
    }
    context.restore()
  }
}
