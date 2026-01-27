import { BaseControl } from "./control";
import { ICursor } from "@/cursor/cursorManager";
import { IBox, IPoint } from "@/types/common.type";

export class RotateControl extends BaseControl {
  constructor(ctx: CanvasRenderingContext2D) {
    super(ctx)
  }
  render(box: IBox): void {
    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = 'rgba(24, 144, 255, 0.12)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.rect(box.minX, box.minY, box.maxX - box.minX, box.maxY - box.minY)
    ctx.fill()
    ctx.restore()
  }
  hitTest(point: IPoint, box: IBox): string | null {
    throw new Error("Method not implemented.");
  }
  getCursor(handle: string, box: IBox): ICursor {
    throw new Error("Method not implemented.");
  }
}