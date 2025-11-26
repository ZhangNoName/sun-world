import { RectElement } from '@/elements/react'
import { BaseTool } from '@/types/tools.type'
import { getUUID } from '@/utils/common'

export class RectTool extends BaseTool {
  name = 'rect'
  private store
  private viewport

  private drawing = false
  private startX = 0
  private startY = 0
  private currentRect: RectElement | null = null

  constructor(store, viewport) {
    super()
    this.store = store
    this.viewport = viewport
  }

  activate() {
    console.log('RectTool activated')
  }
  deactivate() {
    this.drawing = false
    this.currentRect = null
  }

  onMouseDown(e: MouseEvent) {
    const x =
      (e.offsetX - this.viewport.transform.x) / this.viewport.transform.scale
    const y =
      (e.offsetY - this.viewport.transform.y) / this.viewport.transform.scale

    this.drawing = true
    this.startX = x
    this.startY = y

    this.currentRect = new RectElement({
      x,
      y,
      width: 0,
      height: 0,
    })
    this.store.add(this.currentRect)
  }

  onMouseMove(e: MouseEvent) {
    if (!this.drawing || !this.currentRect) return

    const x =
      (e.offsetX - this.viewport.transform.x) / this.viewport.transform.scale
    const y =
      (e.offsetY - this.viewport.transform.y) / this.viewport.transform.scale

    this.currentRect.width = x - this.startX
    this.currentRect.height = y - this.startY
  }

  onMouseUp() {
    this.drawing = false
    this.currentRect = null
  }
}
