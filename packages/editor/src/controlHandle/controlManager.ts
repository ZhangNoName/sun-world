import { IBox, IPoint } from "@/types/common.type"
import { BaseControl } from "./control"
import { CornerControl } from "./cornerControl"
import { ResizeControl } from "./resizeControl"
import { RotateControl } from "./rotateControl"
enum ControlMode {
  Area = 'area',
  Resize = 'resize',
  Rotate = 'rotate',
}
enum IHandle {
  N = 'n',   // 中上
  S = 's',   // 中下
  E = 'e',   // 中右
  W = 'w',   // 中左
  NW = 'nw', // 左上
  NE = 'ne', // 右上
  SW = 'sw', // 左下
  SE = 'se', // 右下
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
    this.getHandlePos()
  }
  render() {
    if (this.box == null) return;
    const box = this.box
    console.log('控制手柄', this.resizeControl.length)
    // this.rotateControl.forEach(control => control.render(box))
    this.resizeControl.forEach(control => control.render())
    // this.areaControl.forEach(control => control.render(box))
  }
  hitTest(point: IPoint) {
    if (this.box == null) return null;
    const box = this.box
    // this.rotateControl.forEach(control => control.hitTest(point, box))
    // this.resizeControl.forEach(control => control.hitTest(point, box))
    // this.areaControl.forEach(control => control.hitTest(point, box))
  }
  getHandlePos() {
    if (this.box == null) return null;
    const box = this.box
    const size = 5
    const midSize = size / 2
    const pos: Partial<Record<IHandle, IPoint>> = {
      [IHandle.NW]: {
        x: box.minX - midSize,
        y: box.minY - midSize,
      },
      [IHandle.NE]: {
        x: box.minX + midSize,
        y: box.minY - midSize,
      },
      [IHandle.SW]: {
        x: box.minX - midSize,
        y: box.maxY + midSize,
      },
      [IHandle.SE]: {
        x: box.minX + midSize,
        y: box.maxY + midSize,
      },
    }
    for (let handle in pos) {
      this.resizeControl.push(new ResizeControl(this.ctx, {
        name: handle,
        pos: pos[handle as IHandle] as IPoint
      }))
    }
    return pos
  }
}