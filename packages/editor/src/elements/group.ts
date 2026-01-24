import { ElementType } from './element.config'
import { BaseElement } from './baseElement.class'
import type { Matrix } from '../types/common.type'
import { EleCreateAttrs } from './ele.type'


export class GroupElement extends BaseElement {
  type: ElementType = ElementType.Group
  constructor(params: Omit<EleCreateAttrs, 'type'>) {
    super({
      ...params,
      type: ElementType.Group,
    })
  }
  draw(ctx: CanvasRenderingContext2D) {
    // Group 本身不绘制实体，仅作为子元素的容器/父节点参与偏移计算
    void ctx
  }
}
