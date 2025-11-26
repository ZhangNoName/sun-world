export abstract class BaseTool {
  abstract name: string

  onMouseDown?(e: MouseEvent): void
  onMouseMove?(e: MouseEvent): void
  onMouseUp?(e: MouseEvent): void
  onKeyDown?(e: KeyboardEvent): void
  onWheel?(e: WheelEvent): void

  activate?(): void
  deactivate?(): void
}
