import { ICursor } from "@/cursor/cursorManager";
import { IBox, IPoint } from "@/types/common.type";

export abstract class BaseControl {
  /** 控件的边距 */
  protected padding: number = 5

  constructor(protected ctx: CanvasRenderingContext2D) { }

  /** 绘制逻辑 */
  abstract render(box: IBox): void;

  /** 命中测试：判断点是否在控件上，返回控制点标识（如 'nw', 'center'）*/
  abstract hitTest(point: IPoint, box: IBox): string | null;

  /** 获取对应的鼠标光标类型 */
  abstract getCursor(handle: string, box: IBox): ICursor;
}