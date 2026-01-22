import {
  elementConfig,
  ElementType,
  FillStyle,
  FillType,
} from './element.config'
import type { IBox, IPoint, Matrix, Point } from '../types/common.type'
import {
  applyToPoint,
  identity,
  invert,
  multiply,
  composeTRS,
  decomposeTRS,
} from '../utils/matrix'

export interface ElementAttrs {
  id: string
  name: string
  width: number
  height: number
  opacity?: number,
  type: ElementType
  visible: boolean
  isSelected: boolean
  fill: FillStyle
  parentId: string | null
  /** 本地变换矩阵：把元素局部坐标系 (0,0..1,1) 映射到父坐标系 */
  matrix: Matrix,
  locked: boolean

}
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

export interface BaseElementParams {
  id: string
  type: ElementType
  name: string
  width: number
  height: number
  parentId: string | null
  matrix?: Matrix
  fill?: FillStyle
}

export abstract class BaseElement {
  // Class directly responsible for width and height
  public width: number = 0
  public height: number = 0

  // Properties encapsulated in attrs
  public attrs: ElementAttrs

  // Children IDs for hierarchy traversal
  public children: string[] | null = null

  // Cache information
  /** AABB in world coordinates */
  protected _aabb: IBox | null = null

  constructor(params: BaseElementParams) {
    this.width = params.width
    this.height = params.height

    this.attrs = {
      id: params.id,
      type: params.type,
      name: params.name,
      visible: true,
      isSelected: false,
      fill: params.fill ?? { type: FillType.Solid, color: '#FF6B6B' },
      parentId: params.parentId,
      matrix: params.matrix ?? composeTRS(0, 0, 0, params.width, params.height)
    }

    // Sync width/height from matrix if provided
    if (params.matrix) {
      const trs = decomposeTRS(params.matrix)
      this.width = trs.width
      this.height = trs.height
    }
  }

  // Getters based on matrix
  get x() { return this.attrs.matrix.e }
  get y() { return this.attrs.matrix.f }
  get rotation() {
    return decomposeTRS(this.attrs.matrix).rotation
  }

  /**
   * 统一更新属性接口
   * 支持更新矩阵相关的几何属性 (x, y, width, height, rotation) 
   * 以及基础属性 (name, visible, fill 等)
   */
  updateAttrs(patch: Partial<ElementAttrs & { x?: number, y?: number, rotation?: number, width?: number, height?: number }>, store?: StoreLike) {
    let matrixChanged = false;
    let needsDirty = false;

    // 1. 处理几何属性（如果 patch 中包含任何一个，都需要重新计算矩阵）
    const hasGeo = patch.x !== undefined || patch.y !== undefined || patch.rotation !== undefined ||
      patch.width !== undefined || patch.height !== undefined || patch.matrix !== undefined;

    if (hasGeo) {
      if (patch.matrix) {
        this.attrs.matrix = patch.matrix;
        const trs = decomposeTRS(this.attrs.matrix);
        this.width = trs.width;
        this.height = trs.height;
        matrixChanged = true;
      } else {
        const trs = decomposeTRS(this.attrs.matrix);
        const newX = patch.x ?? trs.x;
        const newY = patch.y ?? trs.y;
        const newRot = patch.rotation ?? trs.rotation;
        const newW = patch.width ?? trs.width;
        const newH = patch.height ?? trs.height;

        if (newX !== trs.x || newY !== trs.y || newRot !== trs.rotation || newW !== trs.width || newH !== trs.height) {
          this.attrs.matrix = composeTRS(newX, newY, newRot, newW, newH);
          this.width = newW;
          this.height = newH;
          matrixChanged = true;
        }
      }
    }

    // 2. 处理基础属性
    if (patch.name !== undefined) this.attrs.name = patch.name;
    if (patch.visible !== undefined && patch.visible !== this.attrs.visible) {
      this.attrs.visible = patch.visible;
      needsDirty = true;
    }
    if (patch.fill !== undefined) this.attrs.fill = patch.fill;
    if (patch.isSelected !== undefined) this.attrs.isSelected = patch.isSelected;
    if (patch.parentId !== undefined) this.attrs.parentId = patch.parentId;

    // 3. 如果几何或可见性变化，触发布局刷新
    if (matrixChanged || needsDirty) {
      this.markDirty(store);
    }
  }

  /**
   * 仅平移（move 快捷方式）
   */
  move(dx: number, dy: number, store?: StoreLike) {
    // 1. 更新本地矩阵的平移部分
    this.attrs.matrix.e += dx
    this.attrs.matrix.f += dy



    // 3. 递归更新子元素的 AABB
    if (this.children && store) {
      for (const childId of this.children) {
        const child = store.getById(childId)
        child?.moveAABBRecursively(dx, dy, store)
      }
    }
  }

  /**
   * 递归更新 AABB（仅用于平移场景，不改变本地矩阵）
   */
  protected moveAABBRecursively(dx: number, dy: number, store: StoreLike) {
    if (!this._aabb) return
    this._aabb.minX += dx
    this._aabb.maxX += dx
    this._aabb.minY += dy
    this._aabb.maxY += dy

    if (this.children) {
      for (const childId of this.children) {
        const child = store.getById(childId)
        child?.moveAABBRecursively(dx, dy, store)
      }
    }
  }

  /**
   * Mark current element and its children as dirty.
   * Recursively propagates the dirty flag.
   */
  markDirty(store?: StoreLike) {
    if (store) {
      this._updateAABBCache(store)
    }

    if (this.children && store) {
      for (const childId of this.children) {
        const child = store.getById(childId)
        child?.markDirty(store)
      }
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
  getWorldMatrix(store: StoreLike): Matrix {
    const parent = this.attrs.parentId ? store.getById(this.attrs.parentId) : null
    const parentWorld = parent ? parent.getWorldMatrix(store) : identity()

    return multiply(parentWorld, this.attrs.matrix)
  }

  /** 世界坐标 -> 当前元素局部坐标 */
  worldToLocal(store: StoreLike, p: Point): Point | null {
    const inv = this.getInverseWorldMatrix(store)
    if (!inv) return null
    return applyToPoint(inv, p)
  }

  /** 获取世界矩阵的逆 */
  getInverseWorldMatrix(store: StoreLike): Matrix | null {
    const inv = invert(this.getWorldMatrix(store))
    return inv
  }

  private _updateAABBCache(store: StoreLike) {
    const m = this.getWorldMatrix(store)
    const pts = [
      applyToPoint(m, { x: 0, y: 0 }),
      applyToPoint(m, { x: 1, y: 0 }),
      applyToPoint(m, { x: 1, y: 1 }),
      applyToPoint(m, { x: 0, y: 1 }),
    ]
    const xs = pts.map(p => p.x)
    const ys = pts.map(p => p.y)
    this._aabb = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys)
    }
  }

  getAABB() {
    return this._aabb
  }
  clearCache() {
    this._aabb = null
  }

  /** 元素在世界坐标系下的轴对齐包围盒（兼容格式） */
  getWorldAABB(store: StoreLike) {
    return this._aabb
  }

  /**
   * 使用缓存的世界矩阵坐标绘制名称
   */
  showName(ctx: CanvasRenderingContext2D, store: StoreLike) {
    if (!this.attrs.name || !this.attrs.visible) return

    const nameConfig = elementConfig.name
    const worldMatrix = this.getWorldMatrix(store)
    const worldX = worldMatrix.e
    const worldY = worldMatrix.f

    const textX = worldX - (nameConfig.offsetX ?? 0)
    const textY = worldY - (nameConfig.offsetY ?? 0)

    ctx.fillText(this.attrs.name, textX, textY)
  }

  render(ctx: CanvasRenderingContext2D, store: StoreLike) {
    if (!this.attrs.visible) return
    const m = this.getWorldMatrix(store)
    // const m = this.attrs.matrix

    // 关键：每个元素都在“干净的 ctx”上应用自己的 worldMatrix。
    // 如果在父元素 transform 后直接渲染子元素，同时子元素又用 worldMatrix transform，
    // 会导致矩阵叠加（偏移/缩放越来越大）。
    ctx.save()
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f)
    this.draw(ctx)


    // 子元素使用自己的 worldMatrix 绘制，因此必须在 restore 后递归绘制
    if (this.children) {
      for (const childId of this.children) {
        const child = store.getById(childId)
        if (!child?.visible) continue
        child.render(ctx, store)
      }
    }
    ctx.restore()
  }

  // Common setters that should trigger markDirty
  setVisible(visible: boolean, store: StoreLike) {
    if (this.attrs.visible !== visible) {
      this.attrs.visible = visible
      this.markDirty(store)
    }
  }

  setName(name: string) {
    this.attrs.name = name
  }

  setSelected(selected: boolean) {
    this.attrs.isSelected = selected
  }

  // ID and Type (usually immutable)
  get id() { return this.attrs.id }
  get type() { return this.attrs.type }
  get parentId() { return this.attrs.parentId }
  set parentId(id: string | null) { this.attrs.parentId = id }
  get visible() { return this.attrs.visible }
  get isSelected() { return this.attrs.isSelected }
  get name() { return this.attrs.name }
  set name(v: string) { this.attrs.name = v }

  getNodeInfo(): any {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      visible: this.visible,
      parentId: this.parentId,
      children: [] as any[],
      isSelected: false,
      locked: false,
    }
  }

  getAttr() {
    return {
      ...this.attrs,
      width: this.width,
      height: this.height,
      children: [] as any[],
    }
  }

  setAttr(attr: any, store: StoreLike) {
    this.attrs.id = attr.id
    this.attrs.name = attr.name
    this.attrs.type = attr.type
    this.attrs.visible = attr.visible
    this.attrs.parentId = attr.parentId
    this.attrs.fill = attr.fill

    if (attr.matrix) {
      this.attrs.matrix = attr.matrix
    } else {
      // Fallback if matrix is not provided but individual TRS components are
      this.attrs.matrix = composeTRS(
        attr.x ?? 0,
        attr.y ?? 0,
        attr.rotation ?? 0,
        attr.width ?? 0,
        attr.height ?? 0
      )
    }

    const trs = decomposeTRS(this.attrs.matrix)
    this.width = trs.width
    this.height = trs.height
    this.children = attr.children

    this.markDirty(store)
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
