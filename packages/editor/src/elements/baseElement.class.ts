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
  type: ElementType
  visible: boolean
  isSelected: boolean
  fill: FillStyle
  parentId: string | null
  /** 本地变换矩阵：把元素局部坐标系 (0,0..1,1) 映射到父坐标系 */
  matrix: Matrix
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
  protected _worldMatrix: Matrix = identity()
  protected _inverseWorldMatrix: Matrix | null = null
  /** AABB in world coordinates */
  protected _aabb: IBox = { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  protected _isDirty: boolean = true

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
    this.updateAttrs({
      x: this.x + dx,
      y: this.y + dy
    }, store);
  }

  /**
   * Mark current element and its children as dirty.
   * Recursively propagates the dirty flag.
   */
  markDirty(store?: StoreLike) {
    this._isDirty = true
    this._inverseWorldMatrix = null

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
    if (!this._isDirty) return this._worldMatrix

    const parent = this.attrs.parentId ? store.getById(this.attrs.parentId) : null
    const parentWorld = parent ? parent.getWorldMatrix(store) : identity()

    this._worldMatrix = multiply(parentWorld, this.attrs.matrix)

    // Update AABB cache
    this._updateAABBCache()

    this._isDirty = false
    return this._worldMatrix
  }

  /** 世界坐标 -> 当前元素局部坐标 */
  worldToLocal(store: StoreLike, p: Point): Point | null {
    const inv = this.getInverseWorldMatrix(store)
    if (!inv) return null
    return applyToPoint(inv, p)
  }

  /** 获取世界矩阵的逆 */
  getInverseWorldMatrix(store: StoreLike): Matrix | null {
    if (this._inverseWorldMatrix && !this._isDirty) return this._inverseWorldMatrix

    const inv = invert(this.getWorldMatrix(store))
    this._inverseWorldMatrix = inv
    return inv
  }

  private _updateAABBCache() {
    const m = this._worldMatrix
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

  /** 元素在世界坐标系下的轴对齐包围盒（兼容格式） */
  getWorldAABB(store: StoreLike) {
    this.getWorldMatrix(store) // Ensure cache is updated
    return this._aabb
  }

  /**
   * 使用缓存的世界矩阵坐标绘制名称
   */
  showName(ctx: CanvasRenderingContext2D) {
    if (!this.attrs.name || !this.attrs.visible) return

    const nameConfig = elementConfig.name
    const worldX = this._worldMatrix.e
    const worldY = this._worldMatrix.f

    const textX = worldX - (nameConfig.offsetX ?? 0)
    const textY = worldY - (nameConfig.offsetY ?? 0)

    ctx.fillText(this.attrs.name, textX, textY)
  }

  render(ctx: CanvasRenderingContext2D, store: StoreLike) {
    if (!this.attrs.visible) return
    const m = this.getWorldMatrix(store)

    ctx.save()
    ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f)

    this.draw(ctx)

    if (this.children) {
      for (const childId of this.children) {
        const child = store.getById(childId)
        child?.render(ctx, store)
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
    const startX = Math.min(aabb.minX, px.x,)
    const endX = Math.max(aabb.maxX, px.x,)
    const startY = Math.min(aabb.minY, py.y,)
    const endY = Math.max(aabb.maxY, py.y,)

    return startX <= endX && startY <= endY
  }
}
