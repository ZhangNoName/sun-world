import { IBox, IPoint } from "@/types/common.type"

export class ControlHandle {
  private ctx: CanvasRenderingContext2D
  private handleSize = 10
  private selectBox: IBox | null = null
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }
  public setSelectBox(box: IBox) {
    this.selectBox = box
  }
  private calcPos(): IPoint[] {

    return []

  }
  render() {
    if (!this.selectBox) return
    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = 'rgba(24, 144, 255, 0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    // ctx.rect(x, y, width, height)
    ctx.fill()
    ctx.restore()

  }

}