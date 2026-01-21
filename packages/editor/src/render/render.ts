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
  /**
   * 选中元素四角拖拽手柄（屏幕坐标）
   * 后续工具层可以用它做命中判断。
   */
  private selectionHandles: Array<{
    id: string
    x: number
    y: number
    size: number
  }> = []

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
  renderName() {
    const elements = this.store.getRootElements()
    if (!elements?.length) return

    // renderName() 在 render() 的 ctx.restore() 之后调用，此时 ctx 为屏幕坐标系
    for (const el of elements) {
      el.showName(this.ctx)
    }
  }
  renderSelect() {
    // 1) 优先绘制框选矩形（范围选择）
    const marquee = this.store.getMarqueeRect?.() as
      | { x1: number; y1: number; x2: number; y2: number }
      | null
    if (marquee) {
      const ctx = this.ctx
      const { x: tx, y: ty, scale } = this.viewport.transform
      const x = Math.min(marquee.x1, marquee.x2) * scale + tx
      const y = Math.min(marquee.y1, marquee.y2) * scale + ty
      const w = Math.abs(marquee.x2 - marquee.x1) * scale
      const h = Math.abs(marquee.y2 - marquee.y1) * scale

      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#1890ff'
      ctx.fillStyle = 'rgba(24, 144, 255, 0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.rect(x, y, w, h)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      return
    }

    const selectedEl = this.store.getSelectedElement()
    if (!selectedEl) {
      this.selectionHandles = []
      return
    }

    const ctx = this.ctx

    // 注意：renderSelect() 在 render() 的 ctx.restore() 之后调用
    // 此时 ctx 在“屏幕坐标系”，需要把元素 world 坐标转换到屏幕坐标
    const { x: tx, y: ty, scale } = this.viewport.transform
    const toScreen = (x: number, y: number) => ({
      x: x * scale + tx,
      y: y * scale + ty,
    })

    // 用世界矩阵角点绘制选中框（支持父子层级与 rotation）
    const worldCorners = selectedEl.getWorldCorners(this.store)
    const p1 = toScreen(worldCorners[0].x, worldCorners[0].y) // 左上
    const p2 = toScreen(worldCorners[1].x, worldCorners[1].y) // 右上
    const p3 = toScreen(worldCorners[2].x, worldCorners[2].y) // 右下
    const p4 = toScreen(worldCorners[3].x, worldCorners[3].y) // 左下

    // 1) 画选中框
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(p1.x, p1.y)
    ctx.lineTo(p2.x, p2.y)
    ctx.lineTo(p3.x, p3.y)
    ctx.lineTo(p4.x, p4.y)
    ctx.closePath()
    ctx.strokeStyle = '#1890ff'
    ctx.lineWidth = 2
    ctx.stroke()

    // 2) 画四个顶点的拖拽手柄（固定屏幕像素大小）
    const handleSize = 10
    const half = handleSize / 2
    const corners = [p1, p2, p3, p4]

    this.selectionHandles = corners.map((p, idx) => ({
      id: `corner_${idx}`,
      x: p.x - half,
      y: p.y - half,
      size: handleSize,
    }))

    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#1890ff'
    ctx.lineWidth = 2
    for (const h of this.selectionHandles) {
      ctx.beginPath()
      ctx.rect(h.x, h.y, h.size, h.size)
      ctx.fill()
      ctx.stroke()
    }

    ctx.restore()
  }

  render(isDragging: boolean = false) {
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
        el.render(ctx, this.store)
      }
    }

    ctx.restore()

    // 绘制标尺
    if (this.rule) {
      this.rule.render()
    }
    if (isDragging) {
      this.renderSelect()
    }
    this.renderName()
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
