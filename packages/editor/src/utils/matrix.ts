import type { Matrix, Point } from '../types/common.type'

/**
 * 2D 仿射变换矩阵（与 CanvasRenderingContext2D / SVGMatrix 的 a,b,c,d,e,f 含义保持一致）。
 *
 * 统一使用数组表示：`[a, b, c, d, e, f]`，可直接用于：
 * - `ctx.transform(a, b, c, d, e, f)`
 * - `ctx.setTransform(a, b, c, d, e, f)`
 *
 * 对点 \((x, y)\) 的变换为：
 * - \(x' = a x + c y + e\)
 * - \(y' = b x + d y + f\)
 *
 * 重要：矩阵乘法的含义（列向量约定）
 * - `multiply(left, right) = left * right`
 * - 作用到点时：`(left * right) * p` 等价于 **先应用 right，再应用 left**
 */

export const IDENTITY_MATRIX: Matrix = [1, 0, 0, 1, 0, 0]

export function identity(): Matrix {
  return [1, 0, 0, 1, 0, 0]
}

export function translate(tx: number, ty: number): Matrix {
  return [1, 0, 0, 1, tx, ty]
}

export function getTranslation(m: Matrix): { x: number; y: number } {
  return { x: m[4], y: m[5] }
}

/** 设置矩阵的平移分量（保持 a,b,c,d 不变） */
export function setTranslation(m: Matrix, x: number, y: number): Matrix {
  return [m[0], m[1], m[2], m[3], x, y]
}

export function scale(sx: number, sy = sx): Matrix {
  return [sx, 0, 0, sy, 0, 0]
}

/**
 * 旋转矩阵（弧度制）。
 * - Canvas 默认 y 轴向下，因此“视觉方向”与数学坐标系会有差异；这里只生成标准旋转矩阵。
 */
export function rotate(rad: number): Matrix {
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return [cos, sin, -sin, cos, 0, 0]
}

/** 矩阵相乘：返回 `left * right` */
export function multiply(left: Matrix, right: Matrix): Matrix {
  const [la, lb, lc, ld, le, lf] = left
  const [ra, rb, rc, rd, re, rf] = right
  return [
    la * ra + lc * rb,
    lb * ra + ld * rb,
    la * rc + lc * rd,
    lb * rc + ld * rd,
    la * re + lc * rf + le,
    lb * re + ld * rf + lf,
  ]
}

/**
 * 在“父坐标系”下平移当前矩阵（预乘平移矩阵）：`T(dx,dy) * m`
 * - 拖拽元素（在父坐标系移动）通常用这个。
 */
export function translateBy(m: Matrix, dx: number, dy: number): Matrix {
  return multiply(translate(dx, dy), m)
}

/** 将矩阵应用到点上，返回新点 */
export function applyToPoint(m: Matrix, p: Point): Point {
  const [a, b, c, d, e, f] = m
  return {
    x: a * p.x + c * p.y + e,
    y: b * p.x + d * p.y + f,
  }
}

/**
 * 求逆矩阵（若不可逆返回 null）
 *
 * det = a*d - b*c
 */
export function invert(m: Matrix): Matrix | null {
  const [a0, b0, c0, d0, e0, f0] = m
  const det = a0 * d0 - b0 * c0
  if (det === 0) return null

  const invDet = 1 / det
  const a = d0 * invDet
  const b = -b0 * invDet
  const c = -c0 * invDet
  const d = a0 * invDet
  const e = -(a * e0 + c * f0)
  const f = -(b * e0 + d * f0)

  return [a, b, c, d, e, f]
}

/**
 * 组合 TR（平移 + 旋转）。
 * - 对应 Canvas 常见用法：`translate(x,y); rotate(r);`（即 `T * R`）
 */
export function composeTR(x: number, y: number, rotation: number): Matrix {
  return multiply(translate(x, y), rotate(rotation))
}

/**
 * 从矩阵分解出（平移 + 旋转）。
 * - 仅适用于矩阵只包含 TR（不包含缩放/斜切）的情况。
 */
export function decomposeTR(m: Matrix): { x: number; y: number; rotation: number } {
  const [a, b, _c, _d, e, f] = m
  return { x: e, y: f, rotation: Math.atan2(b, a) }
}