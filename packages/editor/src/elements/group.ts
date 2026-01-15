import { ElementType } from './element.config'
import { BaseElement } from './baseElement.class'

export class GroupElement extends BaseElement {
  type: ElementType = ElementType.Group
  constructor(params: { x: number; y: number; width: number; height: number }) {
    super({ type: ElementType.Group, name: 'Group', ...params })
  }
  draw(ctx: CanvasRenderingContext2D, dx: number, dy: number) {
    // Group 本身不绘制实体，仅作为子元素的容器/父节点参与偏移计算
    void ctx
    void dx
    void dy
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
}
