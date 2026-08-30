import {
  createHandleGeometry,
  hitTestHandle,
} from '../../controlHandle/handleGeometry'
import { BaseTool, ToolContext, ToolName } from '../../types/tools.type'
import ViewportState from '../../viewport/viewport'
import DragTool from './drag'
import { RotateTool } from './rotate'
import { ResizeTool } from './resize'
import { AreaTool } from './area'

export default class SelectTool extends BaseTool {
  name: ToolName = 'select'
  private isPanning = false
  private lastX = 0
  private lastY = 0
  private viewport: ViewportState
  private dragging = false
  private readonly DragMode: DragTool
  private readonly AreaMode: AreaTool
  private readonly ResizeMode: ResizeTool
  private readonly RotateMode: RotateTool
  private currentMode: BaseTool | null = null
  constructor(ctx: ToolContext) {
    super(ctx)
    this.viewport = ctx.viewport
    this.DragMode = new DragTool(ctx)
    this.AreaMode = new AreaTool(ctx)
    this.ResizeMode = new ResizeTool(ctx)
    this.RotateMode = new RotateTool(ctx)
  }
  onWheel(e: WheelEvent): void {}
  onMouseDown(e: MouseEvent): void {
    // 只在左键按下时开始
    if (e.button !== 0) return

    const { viewport, elements } = this.ctx

    // 转换屏幕坐标 → 画布坐标
    const canvasPos = viewport.screenToCanvas(e.offsetX, e.offsetY)
    const selectedBox = elements.getSelectedBox()
    const modifierSelection =
      this.ctx.input.state.shift ||
      this.ctx.input.state.ctrl ||
      this.ctx.input.state.meta
    const handle =
      selectedBox && !modifierSelection
        ? hitTestHandle(
            createHandleGeometry(selectedBox, viewport.scale),
            canvasPos
          )
        : null
    // 点击命中检测

    const isDrag = !modifierSelection && elements.hitSelectBox(canvasPos)
    // Selection state is owned by ElementManager's SelectionModel adapter.
    if (handle?.kind === 'resize') {
      this.ResizeMode.setHandle(handle.name)
      this.currentMode = this.ResizeMode
    } else if (handle?.kind === 'rotate') {
      this.currentMode = this.RotateMode
    } else if (isDrag) {
      this.currentMode = this.DragMode
    } else {
      this.currentMode = this.AreaMode
    }
    this.currentMode.onMouseDown(e)
  }
  onMouseMove(e: MouseEvent): void {
    // console.log('SelectTool.onMouseMove', e)
    if (!this.currentMode) {
      // console.warn('No current mode')
      return
    }
    this.currentMode.onMouseMove(e)
  }
  onMouseUp(): void {
    if (!this.currentMode) {
      // console.warn('No current mode')
      return
    }
    this.currentMode.onMouseUp()
    this.currentMode = null
  }
  activate(): void {}
  deactivate(): void {}
  onKeyDown(e: KeyboardEvent): void {
    this.currentMode?.onKeyDown(e)
  }
}
