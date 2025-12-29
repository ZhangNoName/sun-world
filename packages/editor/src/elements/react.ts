import { BaseElement } from './baseElement.class'
import { ElementType } from './element.config'

export class RectElement extends BaseElement {
  type: ElementType = ElementType.Rect
  constructor(params: { x: number; y: number; width: number; height: number }) {
    super({ type: ElementType.Rect, name: 'Rect', ...params })
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    // ctx.scale(this.scaleX, this.scaleY)

    // ctx.fillStyle = this.fill
    ctx.fillStyle = 'red'
    ctx.fillRect(0, 0, this.width, this.height)

    ctx.restore()
  }

  hitTest(px: number, py: number): boolean {
    // 根据矩阵逆变换回局部坐标
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.y &&
      py <= this.y + this.height
    )
  }

  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height }
  }
}
