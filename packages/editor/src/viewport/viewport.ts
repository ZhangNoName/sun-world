// 视图转换数据

import type { Transform } from '@/types/viewport.type'

// 抽象出视图状态：无限画布的关键数据
export class ViewportState {
  public width: number = 0
  public height: number = 0
  public transform: Transform = { x: 0, y: 0, scale: 1.0 }

  // 在一个 Vue/React 环境中，这些属性应该被封装为响应式数据 (e.g., Vue's reactive)
  // 这样当 transform 改变时，Renderer 会自动感知并重绘。

  updateDimensions(width: number, height: number) {
    this.width = width
    this.height = height
  }
}
