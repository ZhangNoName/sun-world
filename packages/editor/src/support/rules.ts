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
    const { scale, x } = this.viewport.transform
    const width = ctx.canvas.width
    const height = this.config.size

    // 清除并绘制背景
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = this.config.backgroundColor
    ctx.fillRect(0, 0, width, height)

    // 设置样式
    ctx.strokeStyle = this.config.lineColor
    ctx.fillStyle = this.config.textColor
    ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    // 动态刻度间隔（Figma 同款算法）
    const step = getStepByZoom(scale)

    // 计算世界坐标起点
    const start = Math.floor(-x / scale / step) * step
    const end = start + width / scale + step

    for (let v = start; v <= end; v += step) {
      const sx = v * scale + x // 世界 -> 屏幕

      const tickHeight = this.config.majorTickHeight

      // 绘制刻度线
      ctx.beginPath()
      ctx.moveTo(sx, height)
      ctx.lineTo(sx, height - tickHeight)
      ctx.stroke()

      ctx.fillText(String(Math.round(v)), sx, this.config.textOffsetY)
    }
  }
  /**
   * 绘制Y轴（纵向标尺）
   */
  private drawYAxis() {
    if (!this.visible) return

    const ctx = this.ctx
    const { scale, y } = this.viewport.transform
    const width = this.config.size
    const height = ctx.canvas.height

    // 清除并绘制背景
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = this.config.backgroundColor
    ctx.fillRect(0, 0, width, height)

    // 设置样式
    ctx.strokeStyle = this.config.lineColor
    ctx.fillStyle = this.config.textColor
    ctx.font = `${this.config.fontSize}px ${this.config.fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    // 动态刻度间隔（Figma 同款算法）
    const step = getStepByZoom(scale)

    // 计算世界坐标起点
    const start = Math.floor(-y / scale / step) * step
    const end = start + height / scale + step

    for (let v = start; v <= end; v += step) {
      const sy = v * scale + y // 世界 -> 屏幕

      const isMajor =
        Math.round(v) % (step * this.config.majorTickMultiple) === 0
      const tickWidth = isMajor
        ? this.config.majorTickHeight
        : this.config.minorTickHeight

      // 绘制刻度线
      ctx.beginPath()
      ctx.moveTo(width, sy)
      ctx.lineTo(width - tickWidth, sy)
      ctx.stroke()

      // 绘制主刻度文字
      if (isMajor) {
        // 旋转文字以垂直显示
        ctx.save()
        ctx.translate(this.config.textOffsetY, sy)
        ctx.rotate(-Math.PI / 2) // 旋转90度
        ctx.fillText(String(Math.round(v)), 0, 0)
        ctx.restore()
      }
    }
  }
  private clearReact() {
    const ctx = this.ctx
    const { scale, x } = this.viewport.transform

    // 清除并绘制背景
    // ctx.clearRect(0, 0, this.config.size, this.config.size)
    ctx.fillStyle = this.config.backgroundColor

    ctx.fillRect(0, 0, this.config.size, this.config.size)
  }
  private drawBorder() {
    const ctx = this.ctx
    const height = ctx.canvas.height
    const width = ctx.canvas.width
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
