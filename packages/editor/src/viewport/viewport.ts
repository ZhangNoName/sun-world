/*
 * @Author: ZhangNoName
 * @Date: 2025-12-03 14:05:26
 * @LastEditors: no name no name
 * @LastEditTime: 2025-12-26 16:02:19
 * @FilePath: \sun-world\packages\editor\src\viewport\viewport.ts
 * @Description:
 *
 * Copyright (c) 2025 by ZhangNoName, All Rights Reserved.
 */
// 视图转换数据

import type { Transform } from '@/types/viewport.type'
type ViewportListener = (scale: number) => void
const STEP_BY_ZOOM = 0.04
// 抽象出视图状态：无限画布的关键数据
export default class ViewportState {
  public width: number = 0
  public height: number = 0
  public transform: Transform = { x: 0, y: 0, scale: 1.0 }
  public scale: number = 1.0
  private listeners: Set<ViewportListener> = new Set()

  // 在一个 Vue/React 环境中，这些属性应该被封装为响应式数据 (e.g., Vue's reactive)
  // 这样当 transform 改变时，Renderer 会自动感知并重绘。
  constructor() {
    // this.width = width
    // this.height = height
    // this.transform = transform
  }
  screenToCanvas(x: number, y: number) {
    return {
      x: (x - this.transform.x) / this.transform.scale,
      y: (y - this.transform.y) / this.transform.scale,
    }
  }

  updateDimensions(width: number, height: number) {
    this.width = width
    this.height = height
  }

  public move(x: number, y: number) {
    // console.log('move', x, y, this.transform.scale)
    this.transform.x += x
    this.transform.y += y
    this.emit()
  }
  public zoomIn(scale: number = 1.1) {
    this.transform.scale *= scale
    this.scale = this.transform.scale
    this.emit()
  }
  public zoomOut(scale: number) {
    this.transform.scale /= scale
    this.emit()
  }
  public zoomTo(scale: number) {
    this.transform.scale = scale
    this.emit()
  }
  public zoom(delta: number) {
    const newScale =
      this.transform.scale + delta * STEP_BY_ZOOM * this.transform.scale
    this.transform.scale = newScale
    this.scale = newScale
    this.emit()
  }

  /**
   * 在指定屏幕位置进行缩放，保持该位置在画布坐标系中不变
   * @param delta 缩放增量
   * @param screenX 屏幕 X 坐标
   * @param screenY 屏幕 Y 坐标
   */
  public zoomAt(delta: number, screenX: number, screenY: number) {
    const oldScale = this.transform.scale
    const newScale = oldScale + delta * STEP_BY_ZOOM * oldScale

    // 计算鼠标指向的画布坐标（缩放前）
    const canvasX = (screenX - this.transform.x) / oldScale
    const canvasY = (screenY - this.transform.y) / oldScale

    // 计算新的 offset，使得缩放后鼠标指向的画布位置保持不变
    // 公式：newOffset = screenPos - canvasPos * newScale
    const newX = screenX - canvasX * newScale
    const newY = screenY - canvasY * newScale

    // 更新 transform
    this.transform.x = newX
    this.transform.y = newY
    this.transform.scale = newScale
    this.scale = newScale
    this.emit()
  }
  public on(listener: ViewportListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener) // 取消订阅
  }

  private emit() {
    this.listeners.forEach((fn) => fn(this.transform.scale))
  }
}
