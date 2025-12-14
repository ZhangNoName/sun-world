import ViewportState from '@/viewport/viewport'

/**
 * 标尺配置选项
 */
export interface RuleConfig {
  /** x轴标尺高度（横向标尺） y轴标尺宽度（纵向标尺） */
  size?: number
  /** 标尺相交区域颜色 */
  interColor?: string
  /** 背景颜色 */
  backgroundColor?: string
  /** 文字颜色 */
  textColor?: string
  /** 线条颜色 */
  lineColor?: string
  /** 字体大小（像素） */
  fontSize?: number
  /** 字体族 */
  fontFamily?: string
  /** 主刻度高度（长刻度） */
  majorTickHeight?: number
  /** 次刻度高度（短刻度） */
  minorTickHeight?: number
  /** 基础刻度间隔（像素） */
  baseStep?: number
  /** 主刻度倍数（每多少个刻度显示一个主刻度） */
  majorTickMultiple?: number
  /** 文字垂直偏移（用于调整文字位置） */
  textOffsetY?: number
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Required<RuleConfig> = {
  size: 20,
  interColor: '#f5f5f5',
  backgroundColor: '#ffffff',
  textColor: '#000',
  lineColor: '#000',
  fontSize: 10,
  fontFamily: 'inter',
  majorTickHeight: 8,
  minorTickHeight: 4,
  baseStep: 10,
  majorTickMultiple: 5,
  textOffsetY: 2,
}

/**
 * 绘制上方及左方标尺
 *  1. X轴(横向，从左往右 -∞ --> +∞)
 *  2. Y轴(纵向，从上往下 -∞ --> +∞)
 */
export class Rule {
  private config: Required<RuleConfig>
  visible: boolean = true

  constructor(
    private ctx: CanvasRenderingContext2D,
    private viewport: ViewportState,
    config?: RuleConfig
  ) {
    // 合并用户配置和默认配置
    this.config = { ...DEFAULT_CONFIG, ...config }

    this.viewport.on(() => this.render())
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
    const step = this.config.baseStep / scale

    // 计算世界坐标起点
    const start = Math.floor(-x / scale / step) * step
    const end = start + width / scale + step

    for (let v = start; v <= end; v += step) {
      const sx = v * scale + x // 世界 -> 屏幕

      const isMajor =
        Math.round(v) % (step * this.config.majorTickMultiple) === 0
      const tickHeight = isMajor
        ? this.config.majorTickHeight
        : this.config.minorTickHeight

      // 绘制刻度线
      ctx.beginPath()
      ctx.moveTo(sx, height)
      ctx.lineTo(sx, height - tickHeight)
      ctx.stroke()

      // 绘制主刻度文字
      if (isMajor) {
        ctx.fillText(String(Math.round(v)), sx, this.config.textOffsetY)
      }
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
    const step = this.config.baseStep / scale

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
    ctx.clearRect(0, 0, this.config.size, this.config.size)
    ctx.fillStyle = this.config.interColor

    ctx.fillRect(0, 0, this.config.size, this.config.size)
  }
  /**
   * 渲染标尺
   */
  public render() {
    if (!this.visible) return
    this.drawXAxis()
    this.drawYAxis()
    this.clearReact()
  }
}
