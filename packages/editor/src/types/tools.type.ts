export type ToolName =
  | 'rect'
  | 'select'
  | 'line'
  | 'text'
  | 'image'
  | 'eraser'
  | 'drag'
  | 'comment'
export abstract class BaseTool {
  abstract name: ToolName

  onMouseDown?(e: MouseEvent): void
  onMouseMove?(e: MouseEvent): void
  onMouseUp?(e: MouseEvent): void
  onKeyDown?(e: KeyboardEvent): void
  onWheel?(e: WheelEvent): void

  activate?(): void
  deactivate?(): void
}
