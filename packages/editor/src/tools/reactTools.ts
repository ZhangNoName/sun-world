/*
 * @Author: ZhangNoName
 * @Date: 2025-12-03 14:07:59
 * @LastEditors: zxy 1623190186@qq.com
 * @LastEditTime: 2026-01-23 16:30:32
 * @FilePath: \sun-world\packages\editor\src\tools\reactTools.ts
 * @Description:
 *
 * Copyright (c) 2025 by ZhangNoName, All Rights Reserved.
 */
import type { ElementManager } from '@/elements/elementManager'
import { RectElement } from '../elements/react'
import { BaseTool, ToolContext, ToolName } from '../types/tools.type'
import { getUUID } from '../utils/common'
import ViewportState from '@/viewport/viewport'
import { ElementType } from '../elements/element.config'
import { composeTRS, setTranslation, translate } from '../utils/matrix'

export class RectTool extends BaseTool {
  name: ToolName = 'rect'
  private elementManager: ElementManager
  private viewport: ViewportState

  private drawing = false
  private startX = 0
  private startY = 0
  private currentRect: RectElement | null = null
  private readonly minWidthToAdd = 5

  constructor(ctx: ToolContext) {
    super(ctx)
    this.elementManager = ctx.elements
    this.viewport = ctx.viewport
  }

  activate() {
    console.log('RectTool activated')
  }
  deactivate() {
    this.drawing = false
    this.currentRect = null
  }

  onMouseDown(e: MouseEvent) {
    // 如果正在绘制中，忽略新的点击
    if (this.drawing) {
      console.log('[RectTool] Already drawing, ignoring')
      return
    }

    const p = this.viewport.screenToCanvas(e.offsetX, e.offsetY)
    const x = p.x
    const y = p.y
    this.drawing = true
    this.startX = x
    this.startY = y
    // 不立即创建/加入：宽度 > minWidthToAdd 时才加入，避免误触
    this.currentRect = null
  }

  onMouseMove(e: MouseEvent) {
    if (!this.drawing) return

    const p = this.viewport.screenToCanvas(e.offsetX, e.offsetY)
    const x = p.x
    const y = p.y

    const left = Math.min(this.startX, x)
    const top = Math.min(this.startY, y)
    const w = Math.abs(x - this.startX)
    const h = Math.abs(y - this.startY)

    // 只有宽度足够时才创建并加入 elementManager
    if (!this.currentRect) {
      if (w <= this.minWidthToAdd) return
      this.currentRect = new RectElement({
        parentId: this.elementManager.ROOT_ID,
        name: this.elementManager.generateName(ElementType.Rect),
        x: left,
        y: top,
        width: w,
        height: h,
      })
      this.elementManager.add(this.currentRect)
      // console.log('RectTool add', this.currentRect)
      return
    }
    this.currentRect.updateAttrs({
      x: left,
      y: top,
      width: w,
      height: h,
    })
    this.elementManager.update()
  }

  onMouseUp() {
    console.log('RectTool onMouseUp')
    // 如果已经创建但最终宽度仍不够，则移除（保证“宽度>5才加入”语义）
    if (this.currentRect && this.currentRect.width <= this.minWidthToAdd) {
      this.elementManager.remove(this.currentRect.id)
    }
    this.drawing = false
    this.currentRect = null
  }
  onKeyDown(e: KeyboardEvent) {
    // console.log('RectTool onKeyDown', e)
  }
  onWheel(e: WheelEvent) {
    // console.log('RectTool onWheel', e)
  }
}
