import { debounce } from '../utils/common'
import type { ViewportState } from '@/viewport/viewport'

/**
 * 职责：管理 Canvas 元素、Context、处理尺寸变化、启动/停止渲染循环。
 */
export class CanvasRenderer {
  private containerElement: HTMLDivElement
  public canvasElement: HTMLCanvasElement
  public ctx: CanvasRenderingContext2D
  private resizeObserver!: ResizeObserver
  private viewport: ViewportState

  constructor(containerElement: HTMLDivElement, viewportState: ViewportState) {
    this.containerElement = containerElement
    this.viewport = viewportState

    // 1. 创建 Canvas 元素
    this.canvasElement = document.createElement('canvas')
    this.canvasElement.style.cssText =
      'display: block; width: 100%; height: 100%;'

    // 2. 初始尺寸设置
    const { clientWidth, clientHeight } = containerElement
    this.canvasElement.width = clientWidth
    this.canvasElement.height = clientHeight
    this.viewport.updateDimensions(clientWidth, clientHeight)

    containerElement.appendChild(this.canvasElement)
    this.ctx = this.canvasElement.getContext('2d')!

    this.setupResizeObserver()
    this.startDrawLoop() // 启动渲染循环
  }

  // 1. 设置 ResizeObserver 来响应容器尺寸变化
  private setupResizeObserver() {
    const resizeHandler = debounce((entries: ResizeObserverEntry[]) => {
      const entry = entries[0]
      if (!entry) return

      const { width, height } = entry.contentRect
      if (
        this.canvasElement.width !== width ||
        this.canvasElement.height !== height
      ) {
        // 更新 Canvas 元素尺寸
        this.canvasElement.width = width
        this.canvasElement.height = height
        // 更新 ViewportState
        this.viewport.updateDimensions(width, height)
        // 触发重绘
        this.draw()
      }
    }, 100)

    this.resizeObserver = new ResizeObserver(resizeHandler)
    this.resizeObserver.observe(this.containerElement)
  }

  // 2. 核心绘制方法
  public draw() {
    const { ctx, viewport } = this
    const { transform, width, height } = viewport

    // 清空画布
    ctx.clearRect(0, 0, width, height)

    // 重置并应用视图变换矩阵 (无限画布的核心)
    ctx.setTransform(
      transform.scale,
      0,
      0,
      transform.scale,
      transform.x,
      transform.y
    )

    // --- 渲染逻辑 ---
    // 在这里添加网格、模型、辅助线等的绘制调用
    // ...
    // --- 渲染逻辑结束 ---

    // 调试信息 (可选)
    ctx.setTransform(1, 0, 0, 1, 0, 0) // 绘制调试信息前重置
    ctx.fillStyle = '#000'
    ctx.fillText(`Scale: ${transform.scale.toFixed(2)}`, 10, 20)
  }

  // 3. 渲染循环 (使用 requestAnimationFrame 保证流畅)
  private startDrawLoop() {
    // 这里的实现取决于具体需求，对于 2D 编辑器，通常只在状态改变时重绘
    // 但保持一个 loop 结构方便未来动画和实时更新
    let lastTime = 0
    const loop = (time: number) => {
      // 可以在此添加性能监测逻辑

      // 如果没有状态变化，可以跳过 draw()
      this.draw()

      lastTime = time
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  // 4. 清理方法
  public destroy() {
    this.resizeObserver.unobserve(this.containerElement)
    this.resizeObserver.disconnect()
    // 移除 canvasElement
    this.containerElement.removeChild(this.canvasElement)
    console.log('Renderer destroyed and cleanup complete.')
  }
}
