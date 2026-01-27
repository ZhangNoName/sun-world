import { IBox } from "@/types/common.type"
import { BaseControl } from "./control"
import { CornerControl } from "./cornerControl"
import { ResizeControl } from "./resizeControl"
import { RotateControl } from "./rotateControl"
enum ControlMode {
  Area = 'area',
  Resize = 'resize',
  Rotate = 'rotate',
}
export type IControl = keyof typeof ControlMode
export class ControlManager {
  private ctx: CanvasRenderingContext2D
  private mode = ControlMode.Area
  private rotateControl: RotateControl[] = []
  private resizeControl: ResizeControl[] = []
  private areaControl: CornerControl[] = []

  private box: IBox | null = null
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }
  setBox(box: IBox) {
    this.box = box
  }
  render() {
    if (!this.box) return
  }



}