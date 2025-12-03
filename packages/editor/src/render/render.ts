import type { ElementStore } from '@/elements/elementStore'
import { debounce } from '../utils/common'
import ViewportState from '@/viewport/viewport'

/**
 * 职责：管理 Canvas 元素、Context、处理尺寸变化、启动/停止渲染循环。
 */
export class CanvasRenderer {
  private containerElement: HTMLDivElement
  public canvasElement: HTMLCanvasElement
  public ctx: CanvasRenderingContext2D
  private resizeObserver!: ResizeObserver
  private viewport: ViewportState
  private store!: ElementStore
  private isDirty = true // 控制是否需要重绘
  constructor(
    containerElement: HTMLDivElement,
    viewportState: ViewportState,
    elementStore: ElementStore
  ) {
    this.containerElement = containerElement
    this.viewport = viewportState
    this.store = elementStore

    // 1. 创建 Canvas 元素
    this.canvasElement = document.createElement('canvas')
    this.canvasElement.style.cssText =
      'display: block; width: 100%; height: 100%;background-color: #f5f5f5;'

    // 2. 初始尺寸设置
    const { clientWidth, clientHeight } = containerElement
    this.canvasElement.width = clientWidth
    this.canvasElement.height = clientHeight
    this.viewport.updateDimensions(clientWidth, clientHeight)

    containerElement.appendChild(this.canvasElement)
    this.ctx = this.canvasElement.getContext('2d')!

    this.setupResizeObserver()
    // this.startDrawLoop() // 启动渲染循环
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
        this.render()
      }
    }, 100)

    this.resizeObserver = new ResizeObserver(resizeHandler)
    this.resizeObserver.observe(this.containerElement)

    this.store.onChange(() => this.render())
  }
  markDirty() {
    this.isDirty = true
  }
  // 渲染线程
  private startDrawLoop() {
    const draw = () => {
      // console.log('Render loop started.')
      if (this.isDirty) {
        this.render()
        this.isDirty = false
      }
      requestAnimationFrame(draw)
    }
    requestAnimationFrame(draw)
  }

  render() {
    const ctx = this.ctx

    ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height)

    ctx.save()

    // 应用 viewport 缩放/平移
    ctx.translate(this.viewport.transform.x, this.viewport.transform.y)
    ctx.scale(this.viewport.transform.scale, this.viewport.transform.scale)

    // 遍历绘制所有元素
    if (this.store) {
      for (const el of this.store.getAll()) {
        el.draw(ctx)
        console.log('Render element:', el)
      }
    }

    ctx.restore()
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
