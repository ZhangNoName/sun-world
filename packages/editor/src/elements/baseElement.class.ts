import {
  elementConfig,
  ElementType,
  FillStyle,
  FillType,
} from './element.config'
import { EleTreeNode } from './elementStore'

export abstract class BaseElement {
  type: ElementType
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number = 0
  visible: boolean = true
  isSelected: boolean = false
  name: string = ''

  fill: FillStyle = { type: FillType.Solid, color: '#FF6B6B' }
  children: string[] | null = null
  parentId: string | null = null
  group: string | null = null

  constructor(params: {
    id: string

    type: ElementType
    name: string
    x: number
    y: number
    width: number
    height: number
    parentId: string
  }) {
    this.id = params.id
    this.type = params.type
    this.name = params.name
    this.x = params.x
    this.y = params.y
    this.width = params.width
    this.height = params.height
    this.parentId = params.parentId
  }

  abstract draw(ctx: CanvasRenderingContext2D, dx: number, dy: number): void


  move(dx: number, dy: number) {
    this.x += dx
    this.y += dy
  }

  resize(newWidth: number, newHeight: number) {
    this.width = newWidth
    this.height = newHeight
  }

  showName(ctx: CanvasRenderingContext2D, dx: number, dy: number) {
    if (!this.name || !this.visible) return

    const nameConfig = elementConfig.name
    ctx.save()
    // ctx.restore()


    // 设置字体
    ctx.font = `${nameConfig.fontSize}px ${nameConfig.fontFamily}`
    ctx.textAlign = nameConfig.textAlign
    ctx.textBaseline = 'top'

    // 测量文本尺寸
    // const textMetrics = ctx.measureText(this.name)

    // 计算文本位置（居中显示在元素上方）
    const textX = this.x + dx + (nameConfig.offsetX ?? 0)
    const textY = this.y + dy + (nameConfig.offsetY ?? 0)

    // 绘制文本描边（提高对比度）
    if (nameConfig.strokeWidth > 0) {
      ctx.strokeStyle = nameConfig.strokeColor
      ctx.lineWidth = nameConfig.strokeWidth
      ctx.strokeText(this.name, textX, textY)
    }

    // 绘制文本
    ctx.fillStyle = this.isSelected ? '#1890ff' : nameConfig.color
    ctx.fillText(this.name, textX, textY)

    ctx.restore()
  }
  render(
    ctx: CanvasRenderingContext2D,
    store: { getById(id: string): BaseElement | undefined },
    dx: number,
    dy: number
  ) {
    if (!this.visible) return
    this.draw(ctx, 0, 0)
    // this.showName(ctx, dx, dy)
    if (this.children) {
      for (const child of this.children) {
        const childElement = store.getById(child)
        if (childElement) {
          childElement.render(ctx, store, dx + this.x, dy + this.y)
        }
      }
    }
  }
  updatePosition(x: number, y: number) {
    this.x += x
    this.y += y
  }

  getBoundingBox() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    }
  }
  setVisible(visible: boolean) {
    this.visible = visible
  }
  setName(name: string) {
    this.name = name
  }
  setSelected(selected: boolean) {
    this.isSelected = selected
  }
  setRotation(rotation: number) {
    this.rotation = rotation
  }
  setX(x: number) {
    this.x = x
  }
  setY(y: number) {
    this.y = y
  }
  setWidth(width: number) {
    this.width = width
  }
  setHeight(height: number) {
    this.height = height
  }
  getNodeInfo() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      visible: this.visible,
      parentId: this.parentId,
      children: [] as EleTreeNode[],
      locked: false,

    }
  }
  getAttr() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      visible: this.visible,
      parentId: this.parentId,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      children: [] as any[],

    }
  }
  setAttr(attr: any) {
    this.id = attr.id
    this.name = attr.name
    this.type = attr.type
    this.visible = attr.visible
    this.parentId = attr.parentId
    this.x = attr.x
    this.y = attr.y
    this.width = attr.width
    this.height = attr.height
    this.rotation = attr.rotation
    this.children = attr.children
  }
  hitTest(px: number, py: number): boolean {
    return px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height
  }
}