/*
 * @Author: ZhangNoName
 * @Date: 2025-12-03 14:07:59
 * @LastEditors: zxy 1623190186@qq.com
 * @LastEditTime: 2026-01-21 16:31:44
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
import { setTranslation, translate } from '../utils/matrix'

export class RectTool extends BaseTool {
  name: ToolName = 'rect'
  private store
  private viewport

  private drawing = false
  private startX = 0
  private startY = 0
  private currentRect: RectElement | null = null
  private readonly minWidthToAdd = 5

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
    // 不立即创建/加入：宽度 > minWidthToAdd 时才加入，避免误触
    this.currentRect = null
  }

  onMouseMove(e: MouseEvent) {
    if (!this.drawing) return

    const x =
      (e.offsetX - this.viewport.transform.x) / this.viewport.transform.scale
    const y =
      (e.offsetY - this.viewport.transform.y) / this.viewport.transform.scale

    const left = Math.min(this.startX, x)
    const top = Math.min(this.startY, y)
    const w = Math.abs(x - this.startX)
    const h = Math.abs(y - this.startY)

    // 只有宽度足够时才创建并加入 store
    if (!this.currentRect) {
      if (w <= this.minWidthToAdd) return
      this.currentRect = new RectElement({
        id: getUUID(),
        parentId: this.store.ROOT_ID,
        width: w,
        height: h,
        matrix: translate(left, top),
        name: this.store.generateName(ElementType.Rect),
      })
      this.store.add(this.currentRect)
      return
    }
    this.currentRect.updateAttrs({
      width: w,
      height: h,
      x: left,
      y: top,
    })
    this.store.update()
  }

  onMouseUp() {
    console.log('RectTool onMouseUp')
    // 如果已经创建但最终宽度仍不够，则移除（保证“宽度>5才加入”语义）
    if (this.currentRect && this.currentRect.width <= this.minWidthToAdd) {
      this.store.remove(this.currentRect.id)
    }
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
