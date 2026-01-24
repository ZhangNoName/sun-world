import { IBox, Matrix, Point } from '@/types/common.type'
import {
  IDENTITY_MATRIX,
  applyToPoint,
  invert,
  multiply,
  scale as scaleMatrix,
  translate as translateMatrix,
} from '../utils/matrix'

type ViewportListener = (scale: number) => void
const STEP_BY_ZOOM = 0.04

// 抽象出视图状态：无限画布的关键数据
export default class ViewportState {
  public width: number = 0
  public height: number = 0
  public transform: Matrix = { ...IDENTITY_MATRIX }

  private listeners: Set<ViewportListener> = new Set()
  private _area: IBox | null = null

  constructor() {}

  /**
   * 获取当前的缩放比例
   */
  get scale(): number {
    return this.transform.a
  }

  /**
   * 获取当前的 X 平移
   */
  get x(): number {
    return this.transform.e
  }

  /**
   * 获取当前的 Y 平移
   */
  get y(): number {
    return this.transform.f
  }

  /**
   * 将屏幕坐标转换为画布坐标
   */
  screenToCanvas(x: number, y: number): Point {
    const inv = invert(this.transform)
    if (!inv) return { x: 0, y: 0 }
    return applyToPoint(inv, { x, y })
  }

  /**
   * 将画布坐标转换为屏幕坐标
   */
  canvasToScreen(canvasX: number, canvasY: number): Point {
    const p = applyToPoint(this.transform, {x:canvasX,y:canvasY})
    return p
  }

  updateDimensions(width: number, height: number) {
    this.width = width
    this.height = height
  }

  public move(x: number, y: number) {
    // 平移是在当前视图坐标系下的移动，这里 x, y 通常是鼠标移动的增量（屏幕像素）
    this.transform.e += x
    this.transform.f += y
    this.emit()
  }

  public zoomIn(scale: number = 1.1) {
    this.zoomTo(this.scale * scale)
  }

  public zoomOut(scale: number = 1.1) {
    this.zoomTo(this.scale / scale)
  }

  public zoomTo(scale: number) {
    const factor = scale / this.scale
    // 简单的缩放，以 (0,0) 为原点
    this.transform.a = scale
    this.transform.d = scale
    // 这里如果只是简单修改 a/d，tx 和 ty 会保持不变，这符合之前的行为
    this.emit()
  }

  public zoom(delta: number) {
    const newScale = this.scale + delta * STEP_BY_ZOOM * this.scale
    this.zoomTo(newScale)
  }

  getRect() {
    return {
      x: this.transform.e,
      y: this.transform.f,
      width: this.width,
      height: this.height,
    }
  }

  /**
   * 在指定屏幕位置进行缩放，保持该位置在画布坐标系中不变
   * @param delta 缩放增量
   * @param offsetX  Canvas 相对坐标 X 坐标
   * @param offsetY  Canvas 相对坐标 Y 坐标
   */
  public zoomAt(delta: number, offsetX: number, offsetY: number) {
    const oldScale = this.scale
    const newScale = oldScale + delta * STEP_BY_ZOOM * oldScale
    if (newScale <= 0) return
    const factor = newScale / oldScale

    // 计算相对于视图内部的坐标
      const px = offsetX 
    const py = offsetY 

    // 变换公式: NewM = T(px, py) * S(factor) * T(-px, -py) * OldM
    const t1 = translateMatrix(px, py)
    const s = scaleMatrix(factor)
    const t2 = translateMatrix(-px, -py)

    this.transform = multiply(t1, multiply(s, multiply(t2, this.transform)))
    this.emit()
  }

  public pointToViewport(x: number, y: number) {
    return applyToPoint(this.transform, { x, y })
  }

  public on(listener: ViewportListener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener) // 取消订阅
  }

  private emit() {
    this.listeners.forEach((fn) => fn(this.scale))
  }
}
