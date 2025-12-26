export const getStepByZoom = (zoom: number) => {
  /**
   * 步长研究，参考 figma
   * 1
   * 2
   * 5
   * 10（对应 500% 往上） 找到规律了： 50 / zoom = 步长
   * 25（对应 200% 往上）
   * 50（对应 100% 往上）
   * 100（对应 50% 往上）
   * 250
   * 500
   * 1000
   * 2500
   * 5000
   */
  const steps = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
  const step = 50 / zoom
  for (let i = 0, len = steps.length; i < len; i++) {
    if (steps[i] >= step) return steps[i]
  }
  return steps[0]
}
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
  /** 边框颜色 */
  borderColor?: string
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
export const DEFAULT_CONFIG: Required<RuleConfig> = {
  size: 20,
  interColor: '#f5f5f5',
  backgroundColor: '#ffffff',
  textColor: '#cecece',
  lineColor: '#b2b2b2',
  borderColor: '#e6e6e6',
  fontSize: 10,
  fontFamily: 'inter',
  majorTickHeight: 8,
  minorTickHeight: 4,
  baseStep: 10,
  majorTickMultiple: 5,
  textOffsetY: 2,
}
