import type { ElementStore } from '@/elements/elementStore'
import { debounce } from '../utils/common'
import ViewportState from '@/viewport/viewport'
import { Rule } from '../support/rules'

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
  private rule?: Rule
  private isDirty = true // 控制是否需要重绘
  private devicePixelRatio: number = 1

  constructor(
    containerElement: HTMLDivElement,
    viewportState: ViewportState,
    elementStore: ElementStore
  ) {
    this.containerElement = containerElement
    this.viewport = viewportState
    this.store = elementStore

    // 获取设备像素比
    this.devicePixelRatio = window.devicePixelRatio || 1

    // 1. 创建 Canvas 元素
    this.canvasElement = document.createElement('canvas')
    this.canvasElement.style.cssText =
      'display: block; width: 100%; height: 100%;background-color: #f5f5f5;'

    containerElement.appendChild(this.canvasElement)
    this.ctx = this.canvasElement.getContext('2d')!

    // 2. 初始尺寸设置（考虑 devicePixelRatio）
    const { clientWidth, clientHeight } = containerElement
    this.updateCanvasSize(clientWidth, clientHeight)
    this.viewport.updateDimensions(clientWidth, clientHeight)

    this.setupResizeObserver()
    // this.startDrawLoop() // 启动渲染循环
  }

  /**
   * 更新 Canvas 尺寸，考虑 devicePixelRatio 以支持高 DPI 屏幕
   */
  private updateCanvasSize(width: number, height: number) {
    // 设置显示尺寸（CSS 像素）
    this.canvasElement.style.width = width + 'px'
    this.canvasElement.style.height = height + 'px'

    // 设置实际绘制尺寸（物理像素）
    // 注意：设置 width/height 会重置 context 的变换矩阵，所以需要重新应用 devicePixelRatio 缩放
    this.canvasElement.width = width * this.devicePixelRatio
    this.canvasElement.height = height * this.devicePixelRatio

    // 重新应用 devicePixelRatio 缩放（因为设置 canvas 尺寸会重置 transform）
    this.ctx.setTransform(
      this.devicePixelRatio,
      0,
      0,
      this.devicePixelRatio,
      0,
      0
    )
  }

  /**
   * 设置标尺
   */
  setRule(rule: Rule) {
    this.rule = rule
  }

  // 1. 设置 ResizeObserver 来响应容器尺寸变化
  private setupResizeObserver() {
    const resizeHandler = debounce((entries: ResizeObserverEntry[]) => {
      const entry = entries[0]
      if (!entry) return

      const { width, height } = entry.contentRect
      const currentDisplayWidth = parseInt(this.canvasElement.style.width) || 0
      const currentDisplayHeight =
        parseInt(this.canvasElement.style.height) || 0

      if (currentDisplayWidth !== width || currentDisplayHeight !== height) {
        // 更新 Canvas 元素尺寸（考虑 devicePixelRatio）
        this.updateCanvasSize(width, height)
        // 更新 ViewportState（使用显示尺寸，不是物理像素）
        this.viewport.updateDimensions(width, height)
        // 触发重绘
        this.render()
      }
    }, 100)

    this.resizeObserver = new ResizeObserver(resizeHandler)
    this.resizeObserver.observe(this.containerElement)

    // 分离监听：层级变化 / 元素变化
    this.store.onHierarchyChange(() => this.render())
    this.store.onElementsChange(() => this.render())
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
  renderSelect() {
    const selectedEl = this.store.getSelectedElement()
    if (!selectedEl) {
      return
    }
    const ctx = this.ctx
    const area = selectedEl.getBoundingBox()
    ctx.beginPath()
    ctx.save()
    ctx.lineTo(area.x, area.y)
    ctx.lineTo(area.x + area.width, area.y)
    ctx.lineTo(area.x + area.width, area.y + area.height)
    ctx.lineTo(area.x, area.y + area.height)
    ctx.closePath()
    ctx.strokeStyle = '#1890ff'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }

  render() {
    const ctx = this.ctx

    // 获取显示尺寸（CSS 像素），用于清除和绘制
    const displayWidth =
      parseInt(this.canvasElement.style.width) ||
      this.canvasElement.width / this.devicePixelRatio
    const displayHeight =
      parseInt(this.canvasElement.style.height) ||
      this.canvasElement.height / this.devicePixelRatio

    ctx.clearRect(0, 0, displayWidth, displayHeight)

    ctx.save()

    // 应用 viewport 缩放/平移
    ctx.translate(this.viewport.transform.x, this.viewport.transform.y)
    ctx.scale(this.viewport.transform.scale, this.viewport.transform.scale)

    // 遍历绘制所有元素（从根节点开始，递归绘制子节点，避免重复渲染）
    if (this.store) {
      const roots = this.store.getRootElements()
      for (const el of roots) {
        el.render(ctx, this.store, 0, 0)
      }
    }

    ctx.restore()
    // 绘制标尺
    if (this.rule) {
      this.rule.render()
    }
    this.renderSelect()
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
