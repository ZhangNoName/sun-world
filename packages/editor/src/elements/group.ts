import { ElementType } from './element.config'
import { BaseElement } from './baseElement.class'
import type { Matrix } from '../types/common.type'

export class GroupElement extends BaseElement {
  type: ElementType = ElementType.Group
  constructor(params: {
    id: string
    parentId: string
    name?: string
    width: number
    height: number
    matrix?: Matrix
    /** 兼容旧调用：将被转换为 matrix */
    x?: number
    y?: number
    rotation?: number
  }) {
    super({
      id: params.id,
      parentId: params.parentId,
      type: ElementType.Group,
      name: params.name ?? 'Group',
      width: params.width,
      height: params.height,
      matrix: params.matrix,
      x: params.x,
      y: params.y,
      rotation: params.rotation,
    })
  }
  draw(ctx: CanvasRenderingContext2D) {
    // Group 本身不绘制实体，仅作为子元素的容器/父节点参与偏移计算
    void ctx
  }
}
