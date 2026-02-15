import { BaseControl } from "./control";
import { ICursor } from "@/cursor/cursorManager";
import { IBox, IPoint } from "@/types/common.type";

export class ResizeControl extends BaseControl {
  protected size = 10;

  constructor(ctx: CanvasRenderingContext2D, config: {
    name: string

  }) {
    super(ctx, config)

  }
  render(): void {
    const ctx = this.ctx
    ctx.save()
    ctx.fillStyle = 'red'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.rect(this.pos.x, this.pos.y, this.size, this.size)
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