import type { IBox, IRect, Matrix, Point, Transform } from '../types/common.type'



export const IDENTITY_MATRIX: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export function identity(): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
}

export function translate(tx: number, ty: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }
}

export function getTranslation(m: Matrix): { x: number; y: number } {
  return { x: m.e, y: m.f }
}

/** 设置矩阵的平移分量（保持 a,b,c,d 不变） */
export function setTranslation(m: Matrix, x: number, y: number): Matrix {
  return { ...m, e: x, f: y }
}

export function scale(sx: number, sy = sx): Matrix {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
}

/**
 * 旋转矩阵（弧度制）。
 * - Canvas 默认 y 轴向下，因此“视觉方向”与数学坐标系会有差异；这里只生成标准旋转矩阵。
 */
export function rotate(rad: number): Matrix {
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

/** 矩阵相乘：返回 `left * right` */
export function multiply(left: Matrix, right: Matrix): Matrix {
  const { a: la, b: lb, c: lc, d: ld, e: le, f: lf } = left
  const { a: ra, b: rb, c: rc, d: rd, e: re, f: rf } = right
  return {
    a: la * ra + lc * rb,
    b: lb * ra + ld * rb,
    c: la * rc + lc * rd,
    d: lb * rc + ld * rd,
    e: la * re + lc * rf + le,
    f: lb * re + ld * rf + lf,
  }
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
  const { a, b, c, d, e, f } = m
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
  const { a: a0, b: b0, c: c0, d: d0, e: e0, f: f0 } = m
  const det = a0 * d0 - b0 * c0
  if (det === 0) return null

  const invDet = 1 / det
  const a = d0 * invDet
  const b = -b0 * invDet
  const c = -c0 * invDet
  const d = a0 * invDet
  const e = -(a * e0 + c * f0)
  const f = -(b * e0 + d * f0)

  return { a, b, c, d, e, f }
}

/**
 * 组合 TRS（平移 + 旋转 + 缩放比例）。
 */
export function composeTRS(x: number, y: number, rotation: number, sx: number, sy: number): Matrix {
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  return {
    a: sx * cos,
    b: sx * sin,
    c: -sy * sin,
    d: sy * cos,
    e: x,
    f: y,
  }
}

/**
 * 从矩阵分解出 TRS（仅适用于无斜切矩阵）。
 */
export function decomposeTRS(m: Matrix) {
  const { a, b, c, d, e, f } = m
  return {
    x: e,
    y: f,
    rotation: Math.atan2(b, a),
    sx: Math.sqrt(a * a + b * b),
    sy: Math.sqrt(c * c + d * d),
  }
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
  const { a, b, e, f } = m
  return { x: e, y: f, rotation: Math.atan2(b, a) }
}

export function box2Point(b: IBox): IRect {
  const x = b.minX
  const y = b.minY
  const width = Math.abs(b.maxX - b.minX)
  const height = Math.abs(b.maxY - b.minY)
  return {
    x,
    y,
    width,
    height

  }
}
/**
 * 
 * @param m 对象形式变换矩阵
 * @returns 数组形式变换矩阵
 */
export function matrix2Array(m: Matrix): Transform {
  return [m.a, m.b, m.c, m.d, m.e, m.f]
}