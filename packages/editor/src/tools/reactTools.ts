/*
 * @Author: ZhangNoName
 * @Date: 2025-12-03 14:07:59
 * @LastEditors: zxy 1623190186@qq.com
 * @LastEditTime: 2026-01-20 16:37:47
 * @FilePath: \sun-world\packages\editor\src\tools\reactTools.ts
 * @Description:
 *
 * Copyright (c) 2025 by ZhangNoName, All Rights Reserved.
 */
import type { ElementStore } from '@/elements/elementStore'
import { RectElement } from '../elements/react'
import { BaseTool, ToolContext, ToolName } from '../types/tools.type'
import { getUUID } from '../utils/common'
import ViewportState from '@/viewport/viewport'
import { ElementType } from '../elements/element.config'

export class RectTool extends BaseTool {
  name: ToolName = 'rect'
  private store
  private viewport

  private drawing = false
  private startX = 0
  private startY = 0
  private currentRect: RectElement | null = null

  constructor(ctx: ToolContext) {
    super(ctx)
    this.store = ctx.elements
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

    const x =
      (e.offsetX - this.viewport.transform.x) / this.viewport.transform.scale
    const y =
      (e.offsetY - this.viewport.transform.y) / this.viewport.transform.scale

    this.drawing = true
    this.startX = x
    this.startY = y

    this.currentRect = new RectElement({
      id: getUUID(),
      parentId: this.store.ROOT_ID,
      x,
      y,
      width: 1,
      height: 1,
      name: this.store.generateName(ElementType.Rect),
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
    this.store.update()

  }

  onMouseUp() {
    console.log('RectTool onMouseUp')
    this.drawing = false
    this.currentRect = null
  }
  onKeyDown(e: KeyboardEvent) {
    console.log('RectTool onKeyDown', e)
  }
  onWheel(e: WheelEvent) {
    console.log('RectTool onWheel', e)
  }
}
