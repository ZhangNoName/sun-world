
// 自定义 Optional 的典型实现
export type Optional<T, K extends keyof T> =
  Omit<T, K> &              // 剔除掉这些键
  Partial<Pick<T, K>>;      // 选出这些键并设为可选，最后合并

// 鼠标位置
export type Point = { x: number; y: number }
/**
 * 仿射变换矩阵
 * 
 * 矩阵形式：
 * [ a  c  e ]
 * [ b  d  f ]
 * [ 0  0  1 ]
 * 
 * 参数说明：
 * - a, b, c, d: 线性变换部分（旋转、缩放、斜切）
 * - e, f: 平移部分（x, y 方向的偏移）
 */
export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number }
export type IRect = { x: number; y: number; width: number; height: number }
export type IPoint = { x: number; y: number }
export type IBox = { minX: number; minY: number; maxX: number; maxY: number }
export type Transform = [a: number, b: number, c: number, d: number, e: number, f: number]
