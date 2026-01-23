// 自定义 Optional 的典型实现
export type Optional<T, K extends keyof T> =
  Omit<T, K> &              // 剔除掉这些键
  Partial<Pick<T, K>>;      // 选出这些键并设为可选，最后合并

// 鼠标位置
export type Point = { x: number; y: number }
// 变换矩阵 {a, b, c, d, e, f} a: 水平缩放, b: 水平倾斜, c: 垂直倾斜, d: 垂直缩放, e: 水平平移, f: 垂直平移
export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number }
export type IRect = { x: number; y: number; width: number; height: number }
export type IPoint = { x: number; y: number }
export type IBox = { minX: number; minY: number; maxX: number; maxY: number }