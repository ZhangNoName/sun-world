import { ElementManager } from '@/elements/elementManager'
import { InputManager } from '@/input/inputManager'
import ViewportState from '@/viewport/viewport'

export type ToolName =
  | 'rect'
  | 'select'
  | 'line'
  | 'text'
  | 'image'
  | 'eraser'
  | 'drag'
  | 'comment'
  | 'area'
  | 'resize'
  | 'rotate'
export interface ToolContext {
  input: InputManager // 鼠标、键盘、组合键（Shift/Alt/Ctrl）
  viewport: ViewportState // 坐标转换、缩放、平移
  elements: ElementManager // hitTest、add、update、remove
  render: (isDragging?: boolean) => void // 渲染调度
}

export abstract class BaseTool {
  protected ctx: ToolContext

  constructor(ctx: ToolContext) {
    this.ctx = ctx
  }

  abstract name: ToolName

  abstract onMouseDown(e: MouseEvent): void
  abstract onMouseMove(e: MouseEvent): void
  abstract onMouseUp(): void
  abstract onKeyDown(e: KeyboardEvent): void
  abstract onWheel(e: WheelEvent): void

  abstract activate(): void
  abstract deactivate(): void
}
