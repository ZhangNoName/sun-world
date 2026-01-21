import { BaseElement, StoreLike, BaseElementParams } from './baseElement.class'
import { ElementType, FillType, getRandomColor } from './element.config'

export interface RectElementParams extends Omit<BaseElementParams, 'type'> {
  // 可以根据需要添加 Rect 特有的参数，目前与 BaseElementParams (除 type 外) 一致
}

export class RectElement extends BaseElement {
  get type(): ElementType { return ElementType.Rect }
  private imageCache: HTMLImageElement | null = null

  constructor(params: RectElementParams) {
    super({
      ...params,
      type: ElementType.Rect,
    })

    // 如果没有提供 fill，则从预设色彩集合中随机获取
    if (!params.fill) {
      console.log('RectElement fill is not provided, using random color')
      this.attrs.fill = { type: FillType.Solid, color: getRandomColor() }
    } else {
      this.attrs.fill = params.fill

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
      if (this.attrs.fill.type === FillType.Image) {
        this.attrs.fill.image = img
      }
    }
    img.onerror = () => {
      console.error(`Failed to load image: ${imageUrl}`)
      // 加载失败时回退到随机颜色
      this.attrs.fill = { type: FillType.Solid, color: getRandomColor() }
    }
    img.src = imageUrl
  }

  draw(ctx: CanvasRenderingContext2D) {
    // 根据填充类型绘制
    // 由于父类 BaseElement 的矩阵已包含 width/height (scale)，
    // 这里的 draw 只需绘制 (0, 0, 1, 1) 的矩形单元。
    const fill = this.attrs.fill
    if (
      fill.type === FillType.Image &&
      (fill.image || this.imageCache)
    ) {
      // 图片填充
      const img = fill.image || this.imageCache
      if (img) {
        ctx.drawImage(img, 0, 0, 1, 1)
      }
    } else {
      // 纯色填充（默认）
      ctx.fillStyle = fill.color || getRandomColor()
      ctx.fillRect(0, 0, 1, 1)
    }
  }

  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height }
  }

  getAttr() {
    return super.getAttr()
  }

  setAttr(attr: any, store: StoreLike) {
    super.setAttr(attr, store)
    if (attr.fill?.type === FillType.Image && attr.fill.imageUrl && attr.fill.imageUrl !== this.attrs.fill.imageUrl) {
      this.loadImage(attr.fill.imageUrl)
    }
  }
}
