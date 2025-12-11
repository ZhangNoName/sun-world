import ViewportState from '@/viewport/viewport'
/**
 * 绘制上方及左方标尺
 *  1. X轴(横向，从左往右 -∞ --> +∞)
 *  2. Y轴(纵向，从上往下 -∞ --> +∞)
 */
export class Rule {
  visible = true
  // x轴就是高度，Y轴就是宽度
  size: number = 20

  constructor(
    private ctx: CanvasRenderingContext2D,
    private viewport: ViewportState
  ) {
    this.viewport.on(() => this.render())
  }
  /**
   * 绘制X轴
   */
  private drawXAxis() {
    const ctx = this.ctx
    const { scale, x } = this.viewport.transform
    const width = ctx.canvas.width
    const height = ctx.canvas.height

    console.log('Render rule - X Axis', width, height)
    ctx.clearRect(0, 0, width, this.size)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, this.size)

    ctx.strokeStyle = '#c1c1c1'
    ctx.fillStyle = '#c1c1c1'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'center'

    // 动态刻度间隔（Figma 同款算法）
    const baseStep = 50
    const step = baseStep / scale

    // 计算世界坐标起点
    const start = Math.floor(-x / scale / step) * step
    const end = start + width / scale + step

    for (let v = start; v <= end; v += step) {
      const sx = v * scale + x // 世界 -> 屏幕

      const isMajor = Math.round(v) % (step * 10) === 0

      ctx.beginPath()
      ctx.moveTo(sx, this.size)
      ctx.lineTo(sx, isMajor ? this.size - 8 : this.size - 4)
      ctx.stroke()

      if (isMajor) {
        ctx.fillText(String(Math.round(v)), sx, 12)
      }
    }
  }
  /**
   * 绘制Y轴

   */
  private drawYAxis() {}
  /**
   * 绘制Y轴

   */
  public render() {
    this.drawXAxis()
    this.drawYAxis()
  }
}
