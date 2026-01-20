import { BaseElement } from './baseElement.class'
import { ElementType, FillType, getRandomColor } from './element.config'
import { getTranslation } from '../utils/matrix'

export class RectElement extends BaseElement {
  type: ElementType = ElementType.Rect
  private imageCache: HTMLImageElement | null = null

  constructor(params: {
    width: number
    height: number
    name: string
    id: string
    parentId: string
    matrix?: import('../types/common.type').Matrix
    rotation?: number
    fill?: { type: FillType; color?: string; imageUrl?: string }
  }) {
    const { id, parentId, ...rest } = params
    super({ ...rest, id: id, parentId: parentId, type: ElementType.Rect })

    // 如果没有提供 fill，则从预设色彩集合中随机获取
    if (!params.fill) {
      console.log('RectElement fill is not provided, using random color')
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

  draw(ctx: CanvasRenderingContext2D) {
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
  }

  getBounds() {
    const { x, y } = getTranslation(this.matrix)
    return { x, y, width: this.width, height: this.height }
  }
  getAttr() {
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
