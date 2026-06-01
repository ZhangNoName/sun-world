// breakpoints.ts
export const BREAKPOINTS = {
  xs: 480, // 手机
  sm: 576, // 小屏幕
  md: 768, // 平板
  lg: 992, // 笔记本
  xl: 1200, // 台式机
  xxl: 1600, // 大屏
} as const

export type BreakpointKey = keyof typeof BREAKPOINTS
