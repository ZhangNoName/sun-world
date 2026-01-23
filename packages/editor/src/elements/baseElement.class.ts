import {
  elementConfig,
  ElementType,
  FillStyle,
  FillType,
} from './element.config'
import type { IBox, IPoint, Matrix, Optional, Point, Transform } from '../types/common.type'
import {
  applyToPoint,
  identity,
  invert,
  multiply,
  composeTRS,
  decomposeTRS,
} from '../utils/matrix'
import { EleAttrs, EleCreateAttrs, NodeInfo } from './ele.type'
import { deepClone, getUUID } from '../utils/common'


export interface PanelAttrs {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface StoreLike {
  getById(id: string): BaseElement | undefined
}

export abstract class BaseElement {

  // Properties encapsulated in attrs
  protected attrs: EleAttrs

  // Children for hierarchy traversal
  public children: BaseElement[] = []
  private _parent: BaseElement | null = null
  get parent(): BaseElement | null {

    return this._parent
  }
  set parent(value: BaseElement) {
    this.attrs.parentId = value.id
    this._parent = value
  }

  // Cache information

  /** AABB (Axis-Aligned Bounding Box) in world coordinates */
  
  private _aabb: IBox | null = null

  constructor(params: EleCreateAttrs) {
    const transform = params.transform ?? identity()
    transform.e = params.x ?? 0
    transform.f = params.y ?? 0
    console.log('创建矩形的transform', transform)
    this.attrs = {
      ...params,

      id: params.id ?? getUUID(),
      visible:params.visible ?? true,
      locked:params.locked ?? false,
      transform: transform
    }
    
  }

  /**
   * 统一更新属性接口
   * 支持更新矩阵相关的几何属性 (x, y, width, height, rotation) 
   * 以及基础属性 (name, visible, fill 等)
   */
  updateAttrs(patch: Partial<PanelAttrs & EleAttrs>) {
    let matrixChanged = false;
    let needsDirty = false;

    // 1. 处理几何属性（如果 patch 中包含任何一个，都需要重新计算矩阵）
    const hasGeo = patch.x !== undefined || patch.y !== undefined || patch.rotation !== undefined ||
      patch.width !== undefined || patch.height !== undefined;
    if (hasGeo) {
      this.attrs.transform.e = patch.x ?? this.attrs.transform.e
      this.attrs.transform.f = patch.y ?? this.attrs.transform.f
      this.attrs.width = patch.width ?? this.attrs.width
      this.attrs.height = patch.height ?? this.attrs.height
      this._updateAABBCache()
      // this.attrs.rotation = patch.rotation ?? this.attrs.rotation
      matrixChanged = true;
      // const trs = decomposeTRS(this.attrs.transform ?? composeTRS(0, 0, 0, 1, 1));
      // const newX = patch.x ?? trs.x;
      // const newY = patch.y ?? trs.y;
      // const newRot = patch.rotation ?? trs.rotation;
      // const newSX = patch.width !== undefined ? patch.width : trs.sx;
      // const newSY = patch.height !== undefined ? patch.height : trs.sy;

      // if (newX !== trs.x || newY !== trs.y || newRot !== trs.rotation || newSX !== trs.sx || newSY !== trs.sy) {
      //   this.attrs.transform = composeTRS(newX, newY, newRot, newSX, newSY);
      //   this.attrs.width = newSX;
      //   this.attrs.height = newSY;
      //   matrixChanged = true;
      // }
    }

    // 2. 处理基础属性
    if (patch.name !== undefined) this.attrs.name = patch.name;
    if (patch.visible !== undefined && patch.visible !== this.attrs.visible) {
      this.attrs.visible = patch.visible;
      needsDirty = true;
    }
    if (patch.fill !== undefined) this.attrs.fill = patch.fill;
    if (patch.locked !== undefined) this.attrs.locked = patch.locked;
    if (patch.parentId !== undefined) this.attrs.parentId = patch.parentId;

  }
  get name(): string {
    return this.attrs.name ?? ''
  }
  get visible(): boolean {
    return this.attrs.visible ?? true
  }
  get parentId(): string {
    return this.attrs.parentId ?? 'root'
  }
  set parentId(value: string) {
    this.attrs.parentId = value
  }
  get id(): string {
    return this.attrs.id
  }
  get width(): number {
    return this.attrs.width
  }
  get height(): number {
    return this.attrs.height
  }
  get rotation(): number {
    return decomposeTRS(this.attrs.transform).rotation
  }
  get matrix():Matrix{

    return {...this.attrs.transform}
  }
  get transform():Transform{
    const m = this.attrs.transform
    return [m.a,m.b,m.c,m.d,m.e,m.f]
  }
  get box():IBox{
  const b = this._aabb || {
    minX:0,
      maxX:0,
      minY:0,
      maxY:0
  }
    return {
     ...b
    }
  }


  /**
   * 仅平移（move 快捷方式）
   */
  move(dx: number, dy: number, store?: StoreLike) {
    // 1. 更新本地矩阵的平移部分
    this.attrs.transform.e += dx
    this.attrs.transform.f += dy
  }

  /**
   * Mark current element and its children as dirty.
   * Recursively propagates the dirty flag.
   */
  markDirty(store?: StoreLike) {
    if (store) {
      this._updateAABBCache(store)
    }

    for (const child of this.children) {
      child.markDirty(store)
    }
  }

  /**
   * 绘制元素本体（在“元素局部坐标系”下绘制）
   * 约定：局部坐标系固定为 [0, 1] 范围
   */
  abstract draw(ctx: CanvasRenderingContext2D): void

  /**
   * 获取世界矩阵
   */
  get worldMatrix(): Matrix {
    if(this.parent){
      return multiply(this.parent.worldMatrix,this.matrix)
    }
    return this.matrix
  }


  /** 获取世界矩阵的逆 */
  getInverseWorldMatrix(): Matrix | null {
    const inv = invert(this.worldMatrix)
    return inv
  }
  private _updateBox(){
    const m = this.worldMatrix

  }
  private _updateAABBCache() {
    const m = this.worldMatrix
    const pts = [
      applyToPoint(m, { x: 0, y: 0 }),
      applyToPoint(m, { x: this.attrs.width, y: 0 }),
      applyToPoint(m, { x: this.attrs.width, y: this.attrs.height }),
      applyToPoint(m, { x: 0, y: this.attrs.height }),
    ]
    const xs = pts.map(p => p.x)
    const ys = pts.map(p => p.y)
  
    this._aabb = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    }
    // console.log('更改坐标系',this._aabb)
  }

  /**
   * 使用缓存的世界矩阵坐标绘制名称
   */
  showName(ctx: CanvasRenderingContext2D) {
    
    if (!this.attrs.name || !this.attrs.visible) return
    const nameConfig = elementConfig.name
    // const worldMatrix = this.transform
    // const worldX = worldMatrix.e
    // const worldY = worldMatrix.f
    // ctx.save()
    const m = this.transform
    // ctx.transform()
    const scale = ctx.getTransform().a
    const textX =this.box.minX - (nameConfig.offsetX / scale)

    const textY =this.box.minY -  (nameConfig.offsetY / scale)
    console.log('绘制名称',textX,textY)
    ctx.fillText(this.attrs.name, textX, textY)
    // ctx.restore()
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.visible) return
    const m = this.attrs.transform
    // const m = this.getWorldMatrix()
    // const m = this.attrs.transform

    // 关键：每个元素都在“干净的 ctx”上应用自己的 worldMatrix。
    // 如果在父元素 transform 后直接渲染子元素，同时子元素又用 worldMatrix transform，
    // 会导致矩阵叠加（偏移/缩放越来越大）。
    ctx.save()
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f)
    this.draw(ctx)


    // 子元素使用自己的 worldMatrix 绘制，因此必须在 restore 后递归绘制
    for (const child of this.children) {
      if (!child.visible) continue
      child.render(ctx)
    }
    ctx.restore()
  }


  getNodeInfo(): NodeInfo {
    return {
      id: this.attrs.id,
      name: this.attrs.name,
      type: this.attrs.type,
      visible: this.visible,
      parentId: this.parentId,
      children: this.children.map(c => c.getNodeInfo()),
      locked: false,
    }
  }
  getPanelAttrs(): PanelAttrs {
    return {
      x: this.attrs.transform.e,
      y: this.attrs.transform.f,
      width: this.width,
      height: this.height,
      rotation: this.rotation,
      // fill:deepClone(this.attrs.fill),
    }
  }

  toJSON() {
    return this.getNodeInfo()
  }



  /**
   * 命中检测
   */
  hitTest(px: IPoint, py: IPoint, store: StoreLike): boolean {

    const aabb = this.getAABB()
    if (!aabb) return false
    const startX = Math.min(aabb.minX, px.x,)
    const endX = Math.max(aabb.maxX, px.x,)
    const startY = Math.min(aabb.minY, py.y,)
    const endY = Math.max(aabb.maxY, py.y,)

    return startX <= endX && startY <= endY
  }
}
