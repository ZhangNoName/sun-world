import { ElementStore } from '@/elements/elementStore'
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
export interface ToolContext {
  input: InputManager // 鼠标、键盘、组合键（Shift/Alt/Ctrl）
  viewport: ViewportState // 坐标转换、缩放、平移
  elements: ElementStore // hitTest、add、update、remove
  render: () => void // 渲染调度
}

export abstract class BaseTool {
  protected ctx: ToolContext

  constructor(ctx: ToolContext) {
    this.ctx = ctx
  }

  abstract name: ToolName

  onMouseDown?(e: MouseEvent): void
  onMouseMove?(e: MouseEvent): void
  onMouseUp?(e: MouseEvent): void
  onKeyDown?(e: KeyboardEvent): void
  onWheel?(e: WheelEvent): void

  activate?(): void
  deactivate?(): void
}
