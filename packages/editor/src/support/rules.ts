import ViewportState from '@/viewport/viewport'
import { DEFAULT_CONFIG, getStepByZoom, RuleConfig } from './rule.config'

/**
 * 绘制上方及左方标尺
 *  1. X轴(横向，从左往右 -∞ --> +∞)
 *  2. Y轴(纵向，从上往下 -∞ --> +∞)
 */
export class Rule {
  private config: Required<RuleConfig>
  visible: boolean = true
  private onViewportChange?: () => void

  constructor(
    private ctx: CanvasRenderingContext2D,
    private viewport: ViewportState,
    config?: RuleConfig
  ) {
    // 合并用户配置和默认配置
    this.config = { ...DEFAULT_CONFIG, ...config }

    this.viewport.on(() => {
      // 通知外部重新渲染（通常是renderer）
      this.onViewportChange?.()
    })
  }

  /**
   * 设置viewport变化时的回调
   */
  setViewportChangeCallback(callback: () => void) {
    this.onViewportChange = callback
  }
  /**
   * 隐藏标尺
   */
  hidden() {
    this.visible = false
  }
  /**
   * 显示标尺
   */
  show() {
    this.visible = true
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<RuleConfig>) {
    this.config = { ...this.config, ...config }

    this.render()
  }

  /**
   * 获取当前配置
   */
  getConfig(): Readonly<Required<RuleConfig>> {
    return { ...this.config }
  }
  /**
   * 绘制X轴（横向标尺）
   */
  private drawXAxis() {
    if (!this.visible) return

    const ctx = this.ctx
    const scale = this.viewport.scale
    const x = this.viewport.x
    // 使用显示尺寸（CSS 像素），因为 context 已经应用了 devicePixelRatio 缩放
    const width = this.viewport.width
    const height = this.config.size

    // 清除并绘制背景
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = this.config.backgroundColor
    ctx.fillRect(0, 0, width, height)

    // 设置样式
    ctx.lineWidth = 1 // 明确设置线宽
    ctx.strokeStyle = this.config.lineColor

    ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    // 动态刻度间隔（Figma 同款算法）
    const step = getStepByZoom(scale)

    // 计算世界坐标起点
    const start = Math.floor(-x / scale / step) * step
    const end = start + width / scale + step
    // 绘制刻度线
    ctx.beginPath()
    const tickHeight = this.config.majorTickHeight
    for (let v = start; v <= end; v += step) {
      const sx = v * scale + x // 世界 -> 屏幕
      if (sx < 0 || sx > width) continue
      ctx.moveTo(sx, height)
      ctx.lineTo(sx, height - tickHeight)
      ctx.fillStyle = this.config.textColor
      ctx.fillText(String(Math.round(v)), sx, this.config.textOffsetY)
    }
    ctx.strokeStyle = this.config.lineColor
    ctx.stroke()
  }
  private drawYAxis() {
    if (!this.visible) return

    const ctx = this.ctx
    const scale = this.viewport.scale
    const y = this.viewport.y
    const width = this.config.size
    const height = this.viewport.height

    // 1. 清除并绘制背景
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = this.config.backgroundColor
    ctx.fillRect(0, 0, width, height)

    // 2. 基础样式设置
    ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`
    ctx.textAlign = 'right' // 文字右对齐，靠近刻度线
    ctx.textBaseline = 'middle' // 纵向居中，对齐刻度线

    const step = getStepByZoom(scale)
    const start = Math.floor(-y / scale / step) * step
    const end = start + height / scale + step
    const tickHeight = this.config.majorTickHeight

    // 3. 开始绘制刻度线
    ctx.strokeStyle = this.config.lineColor
    ctx.lineWidth = 1
    ctx.beginPath()

    for (let v = start; v <= end; v += step) {
      // 关键：像素对齐，防止模糊
      const sy = Math.round(v * scale + y) - 0.5

      if (sy < 0 || sy > height) continue

      // 绘制横向小刻度
      ctx.moveTo(width, sy)
      ctx.lineTo(width - tickHeight, sy)

      // 2. 绘制竖向文字
      ctx.save() // 必须 save，否则后续绘制会乱

      // 设置文字样式
      ctx.fillStyle = this.config.textColor
      ctx.textAlign = 'center'

      /**
       * 关键步骤：
       * 1. translate: 将画布原点移动到文字应该出现的位置
       * 2. rotate: 旋转画布 (-90度 = -Math.PI / 2)
       * 3. fillText: 在新的原点 (0,0) 附近绘制文字
       */
      const textX = tickHeight + 4 // 距离刻度线左侧 4px
      const textY = sy

      ctx.translate(textX, textY)
      ctx.rotate(-Math.PI / 2) // 逆时针旋转 90 度

      // 此时 (0,0) 就是原来的 (textX, textY)
      ctx.fillText(String(Math.round(v)), 0, 0)

      ctx.restore() // 必须 restore，恢复到正常坐标系
    }
    ctx.stroke()

    // 绘制 Y 轴右侧的边界线（Figma 风格）
    ctx.beginPath()
    ctx.moveTo(width - 0.5, 0)
    ctx.lineTo(width - 0.5, height)
    ctx.strokeStyle = this.config.borderColor
    ctx.stroke()
  }
  private clearReact() {
    const ctx = this.ctx
    const scale = this.viewport.scale
    const x = this.viewport.x

    // 清除并绘制背景
    // ctx.clearRect(0, 0, this.config.size, this.config.size)
    ctx.fillStyle = this.config.backgroundColor

    ctx.fillRect(0, 0, this.config.size, this.config.size)
  }
  private drawBorder() {
    const ctx = this.ctx
    // 使用显示尺寸（CSS 像素），因为 context 已经应用了 devicePixelRatio 缩放
    const height = this.viewport.height
    const width = this.viewport.width
    const size = this.config.size
    ctx.strokeStyle = this.config.borderColor
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, size)
    ctx.lineTo(width, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, height)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(size, 0)
    ctx.lineTo(size, height)
    ctx.stroke()
  }
  /**
   * 渲染标尺
   */
  public render() {
    if (!this.visible) return
    this.drawXAxis()
    this.drawYAxis()
    this.clearReact()
    this.drawBorder()
  }
}
