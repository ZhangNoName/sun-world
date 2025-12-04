// 视图转换数据

import type { Transform } from '@/types/viewport.type'
type ViewportListener = () => void
// 抽象出视图状态：无限画布的关键数据
export default class ViewportState {
  public width: number = 0
  public height: number = 0
  public transform: Transform = { x: 0, y: 0, scale: 1.0 }
  private listeners: Set<ViewportListener> = new Set()
  // 在一个 Vue/React 环境中，这些属性应该被封装为响应式数据 (e.g., Vue's reactive)
  // 这样当 transform 改变时，Renderer 会自动感知并重绘。
  constructor() {
    // this.width = width
    // this.height = height
    // this.transform = transform
  }

  updateDimensions(width: number, height: number) {
    this.width = width
    this.height = height
  }

  public move(x: number, y: number) {
    console.log('move', x, y, this.transform.scale)
    this.transform.x += x
    this.transform.y += y
    this.emit()
  }
  public on(listener: ViewportListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener) // 取消订阅
  }

  private emit() {
    this.listeners.forEach((fn) => fn())
  }
}
