import { BaseElement } from './baseElement.class'
import { EleAttrs, EleCreateAttrs } from './ele.type'
import { ElementType, FillType, getRandomColor } from './element.config'


export class RectElement extends BaseElement {
  get type(): ElementType { return ElementType.Rect }
  private imageCache: HTMLImageElement | null = null

  constructor(params: Omit<EleCreateAttrs, 'type'>) {
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
      // if (this.attrs.fill.type === FillType.Image) {
      //   this.attrs.fill.image = img
      // }
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
    // console.log('draw', this.attrs.name, ctx.getTransform())
    const fill = this.attrs.fill
    // 纯色填充（默认）
    ctx.fillStyle = fill?.color || getRandomColor()
    // console.log('draw', this.width, this.height)
    ctx.fillRect(0, 0, this.width, this.height)

  }

  toJSON() {
    return super.toJSON()
  }

  updateAttrs(attr: any) {
    super.updateAttrs(attr)

  }
}
