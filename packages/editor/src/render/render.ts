
import type { ElementManager } from '@/elements/elementManager'
import { debounce, rafThrottle } from '../utils/common'
import ViewportState from '@/viewport/viewport'
import { Rule } from '../support/rules'
import { elementConfig } from '../elements/element.config'
import { applyToPoint, box2Point, matrix2Array } from '../utils/matrix'
import { ControlManager } from '../controlHandle/controlManager'

/**
 * 职责：管理 Canvas 元素、Context、处理尺寸变化、启动/停止渲染循环。
 */
export class CanvasRenderer {
  private containerElement: HTMLDivElement
  public canvasElement: HTMLCanvasElement
  public ctx: CanvasRenderingContext2D
  private resizeObserver!: ResizeObserver
  private viewport: ViewportState
  private elementManager!: ElementManager
  private controlManager!: ControlManager
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
    elementManager: ElementManager
  ) {
    this.containerElement = containerElement
    this.viewport = viewportState
    this.elementManager = elementManager


    // 获取设备像素比
    this.devicePixelRatio = window.devicePixelRatio || 1

    // 1. 创建 Canvas 元素
    this.canvasElement = document.createElement('canvas')
    this.canvasElement.style.cssText =
      'display: block; width: 100%; height: 100%;background-color: #f5f5f5;'

    containerElement.appendChild(this.canvasElement)
    this.ctx = this.canvasElement.getContext('2d')!
    this.controlManager = new ControlManager(this.ctx)

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

  /**
   * 设置 ResizeObserver 来响应容器尺寸变化
   */
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
    this.elementManager.onHierarchyChange(() => this.render())
    this.elementManager.onElementsChange(() => this.render())
  }
  markDirty() {
    this.isDirty = true
  }
  renderName() {

    const elements = this.elementManager.getRootElements()
    if (!elements?.length) return
    const nameConfig = elementConfig.name
    const { offsetX, offsetY } = nameConfig
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    const dpr = this.devicePixelRatio
    this.ctx.scale(dpr, dpr)

    this.ctx.font = `${nameConfig.fontSize}px ${nameConfig.fontFamily}`
    this.ctx.textAlign = nameConfig.textAlign
    this.ctx.textBaseline = 'top'
    this.ctx.fillStyle = nameConfig.color

    // renderName() 在 render() 的 ctx.restore() 之后调用，此时 ctx 为屏幕坐标系
    for (const el of elements) {
      const m = el.worldMatrix
      const p = this.viewport.canvasToScreen(m.e, m.f)
      this.ctx.fillText(el.name, p.x + offsetX, p.y + offsetY)
    }
    this.ctx.restore()
  }
  renderSelect() {
    // 1) 优先绘制框选矩形（范围选择）
    const marquee = this.elementManager.getMarqueeRect()
    const selectedBox = this.elementManager.getSelectedBox()
    const ctx = this.ctx
    const tx = this.viewport.x
    const ty = this.viewport.y
    const scale = this.viewport.scale
    ctx.transform(...matrix2Array(this.viewport.transform))
    if (selectedBox) {
      this.controlManager.setBox(selectedBox)
      const { x, y, width, height } = box2Point(selectedBox)
      // this.transform()
      // ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#1890ff'
      ctx.fillStyle = 'rgba(24, 144, 255, 0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.rect(x, y, width, height)
      ctx.fill()
      ctx.stroke()
      this.controlManager.render()
    }
    if (marquee) {
      const { x, y, width, height } = box2Point(marquee)
      // const x = Math.min(marquee.minX, marquee.maxX) * scale + tx
      // const y = Math.min(marquee.minY, marquee.maxY) * scale + ty
      // const w = Math.abs(marquee.maxX - marquee.minX) * scale
      // const h = Math.abs(marquee.maxY - marquee.minY) * scale

      ctx.save()
      ctx.setLineDash([6, 4])
      ctx.strokeStyle = '#1890ff'
      ctx.fillStyle = 'rgba(24, 144, 255, 0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.rect(x, y, width, height)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
      return
    }

    ctx.restore()
  }

  render = rafThrottle(() => {
    const ctx = this.ctx
    // 获取显示尺寸（CSS 像素），用于清除和绘制
    const displayWidth =
      this.canvasElement.width
    const displayHeight =
      this.canvasElement.height

    ctx.clearRect(0, 0, displayWidth, displayHeight)
    this.transform()
    this.elementManager.renderAll(ctx)

    ctx.restore()


    this.renderSelect()

    this.renderName()
    if (this.rule) {
      this.rule.render()
    }
    this.ctx.restore()
  })

  /**
   * 清理方法
   */
  public destroy() {
    this.resizeObserver.unobserve(this.containerElement)
    this.resizeObserver.disconnect()
    // 移除 canvasElement
    this.containerElement.removeChild(this.canvasElement)
    console.log('Renderer destroyed and cleanup complete.')
  }
  private transform() {
    const { a, b, c, d, e, f } = this.viewport.transform
    this.ctx.save()
    this.ctx.transform(a, b, c, d, e, f)
  }
}

