import { SWEditor } from '@/editor'
import { transformer } from '@/transformer/transformer'

// 🟧 EventManager（鼠标 + Canvas 事件管理）

// 负责：

// canvas 上的鼠标事件（mousedown / mousemove / mouseup）

// contextmenu（右键）

// wheel（滚轮缩放/滚动）

// pointer events

// 坐标转换（屏幕坐标 → 画布坐标）
export class EventManager {
  constructor(private editor: SWEditor) {
    const canvas = editor.getCanvas()

    canvas.addEventListener('mousedown', this.handleMouseDown)
    canvas.addEventListener('mousemove', this.handleMouseMove)
    canvas.addEventListener('mouseup', this.handleMouseUp)
  }

  handleMouseDown = (e: MouseEvent) => {
    const p = transformer.toCanvas(e) // 坐标统一转换
    this.editor.toolManager.activeTool?.onMouseDown(p)
  }

  handleMouseMove = (e: MouseEvent) => {
    const p = transformer.toCanvas(e)
    this.editor.toolManager.activeTool?.onMouseMove(p)
  }

  handleMouseUp = (e: MouseEvent) => {
    const p = transformer.toCanvas(e)
    this.editor.toolManager.activeTool?.onMouseUp(p)
  }
}
