import {
  elementConfig,
  ElementType,
  FillStyle,
  FillType,
} from './element.config'

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
    type: ElementType
    name: string
    x: number
    y: number
    width: number
    height: number
  }) {
    this.id = crypto.randomUUID()
    this.type = params.type
    this.name = params.name
    this.x = params.x
    this.y = params.y
    this.width = params.width
    this.height = params.height
  }

  abstract draw(ctx: CanvasRenderingContext2D): void
  abstract hitTest(px: number, py: number): boolean

  move(dx: number, dy: number) {
    this.x += dx
    this.y += dy
  }

  resize(newWidth: number, newHeight: number) {
    this.width = newWidth
    this.height = newHeight
  }

  showName(ctx: CanvasRenderingContext2D) {
    if (!this.name || !this.visible) return

    const nameConfig = elementConfig.name
    ctx.save()

    // 设置字体
    ctx.font = `${nameConfig.fontSize}px ${nameConfig.fontFamily}`
    ctx.textAlign = nameConfig.textAlign
    ctx.textBaseline = 'top'

    // 测量文本尺寸
    // const textMetrics = ctx.measureText(this.name)

    // 计算文本位置（居中显示在元素上方）
    const textX = this.x + +nameConfig.offsetX
    const textY = this.y + nameConfig.offsetY

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
  render(ctx: CanvasRenderingContext2D) {
    if (!this.visible) return
    this.draw(ctx)
    this.showName(ctx)
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
}
