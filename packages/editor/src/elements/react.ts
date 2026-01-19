import { BaseElement } from './baseElement.class'
import { ElementType, FillType, getRandomColor } from './element.config'

export class RectElement extends BaseElement {
  type: ElementType = ElementType.Rect
  private imageCache: HTMLImageElement | null = null

  constructor(params: {
    x: number
    y: number
    width: number
    height: number
    fill?: { type: FillType; color?: string; imageUrl?: string }
  }) {
    super({ type: ElementType.Rect, name: 'Rect', ...params })

    // 如果没有提供 fill，则从预设色彩集合中随机获取
    if (!params.fill) {
      this.fill = { type: FillType.Solid, color: getRandomColor() }
    } else {
      this.fill = params.fill

      // 如果是图片类型，预加载图片
      if (params.fill.type === FillType.Image && params.fill.imageUrl) {
        this.loadImage(params.fill.imageUrl)
      }
    }
  }

  // 加载图片
  private loadImage(imageUrl: string) {
    if (this.imageCache) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      this.imageCache = img
      this.fill.image = img
    }
    img.onerror = () => {
      console.error(`Failed to load image: ${imageUrl}`)
      // 加载失败时回退到随机颜色
      this.fill = { type: FillType.Solid, color: getRandomColor() }
    }
    img.src = imageUrl
  }

  draw(ctx: CanvasRenderingContext2D, dx: number, dy: number) {
    ctx.save()
    ctx.translate(this.x + dx, this.y + dy)
    ctx.rotate(this.rotation)

    // 根据填充类型绘制
    if (
      this.fill.type === FillType.Image &&
      (this.fill.image || this.imageCache)
    ) {
      // 图片填充
      const img = this.fill.image || this.imageCache
      if (img) {
        ctx.drawImage(img, 0, 0, this.width, this.height)
      }
    } else {
      // 纯色填充（默认）
      ctx.fillStyle = this.fill.color || getRandomColor()
      ctx.fillRect(0, 0, this.width, this.height)
    }

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
  getAttr(){
    return {
      ...super.getAttr(),
      fill: this.fill,
    }
  }
  setAttr(attr: any) {
    super.setAttr(attr)
    this.fill = attr.fill
  }
}
