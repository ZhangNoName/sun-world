import {
  elementConfig,
  ElementType,
  FillStyle,
  FillType,
} from './element.config'
import { EleTreeNode } from './elementStore'
import type { Matrix, Point } from '../types/common.type'
import {
  applyToPoint,
  identity,
  invert,
  multiply,
  composeTR,
  setTranslation,
  translateBy,
} from '../utils/matrix'

export abstract class BaseElement {
  type: ElementType
  id: string
  width: number
  height: number
  /**
   * 本地变换矩阵：把元素局部坐标系 (0,0..w,h) 映射到父坐标系
   * - 使用 `common.type.ts` 的数组形式 `[a,b,c,d,e,f]`
   */
  matrix: Matrix
  visible: boolean = true
  isSelected: boolean = false
  name: string = ''

  fill: FillStyle = { type: FillType.Solid, color: '#FF6B6B' }
  children: string[] | null = null
  parentId: string | null = null
  group: string | null = null
  private _worldMatrix: Matrix = identity()
  private _worldMatrixEpoch = -1
  private _inverseWorldMatrix: Matrix | null = null
  private _inverseWorldMatrixEpoch = -1

  constructor(params: {
    id: string

    type: ElementType
    name: string
    width: number
    height: number
    parentId: string

    /**
     * 推荐：直接传本地矩阵
     * - 若未提供，会尝试从旧字段 x/y/rotation 兼容生成（便于数据迁移）
     */
    matrix?: Matrix
  }) {
    this.id = params.id
    this.type = params.type
    this.name = params.name
    this.width = params.width
    this.height = params.height
    this.parentId = params.parentId
    this.matrix = params.matrix ?? identity()
  }

  /**
   * 绘制元素本体（在“元素局部坐标系”下绘制）
   *
   * 约定：`BaseElement.render()` 会先对 ctx 应用：
   * - transform(...this.matrix)
   *
   * 因此这里的 draw 应该直接在 (0,0) 开始绘制元素内容。
   */
  abstract draw(ctx: CanvasRenderingContext2D): void

  /**
   * 本地矩阵：把“元素自身局部坐标系 (0,0..w,h)”映射到“父坐标系”
   */
  getLocalMatrix(): Matrix {
    return this.matrix
  }

  /**
   * 世界矩阵：把元素局部坐标映射到“世界坐标系”（root 下的坐标系）
   * - world = parentWorld * local
   */
  getWorldMatrix(store: {
    getById(id: string): BaseElement | undefined
    getWorldMatrixEpoch?: () => number
  }): Matrix {
    const epoch = store.getWorldMatrixEpoch?.() ?? -1
    if (epoch !== -1 && this._worldMatrixEpoch === epoch) return this._worldMatrix

    // 先收集父链，避免递归（也避免潜在循环引用时无限递归）
    const chain: BaseElement[] = []
    let pid = this.parentId
    while (pid && pid !== 'root') {
      const parent = store.getById(pid)
      if (!parent) break
      chain.push(parent)
      pid = parent.parentId
    }

    let m = this.getLocalMatrix()
    for (let i = chain.length - 1; i >= 0; i--) {
      m = multiply(chain[i].getLocalMatrix(), m)
    }
    this._worldMatrix = m
    this._worldMatrixEpoch = epoch
    return m
  }

  /** 世界坐标 -> 当前元素局部坐标（不可逆时返回 null） */
  worldToLocal(
    store: { getById(id: string): BaseElement | undefined },
    p: Point
  ): Point | null {
    const inv = this.getInverseWorldMatrix(store)
    if (!inv) return null
    return applyToPoint(inv, p)
  }

  /** 缓存的 worldMatrix 的逆（用于 hitTest / 坐标逆变换） */
  getInverseWorldMatrix(store: {
    getById(id: string): BaseElement | undefined
    getWorldMatrixEpoch?: () => number
  }): Matrix | null {
    const epoch = store.getWorldMatrixEpoch?.() ?? -1
    if (epoch !== -1 && this._inverseWorldMatrixEpoch === epoch) return this._inverseWorldMatrix

    const inv = invert(this.getWorldMatrix(store))
    this._inverseWorldMatrix = inv
    this._inverseWorldMatrixEpoch = epoch
    return inv
  }

  /** 获取元素四个角点的世界坐标（顺序：左上、右上、右下、左下） */
  getWorldCorners(store: { getById(id: string): BaseElement | undefined }): Point[] {
    const m = this.getWorldMatrix(store)
    const w = this.width
    const h = this.height
    return [
      applyToPoint(m, { x: 0, y: 0 }),
      applyToPoint(m, { x: w, y: 0 }),
      applyToPoint(m, { x: w, y: h }),
      applyToPoint(m, { x: 0, y: h }),
    ]
  }

  /** 元素在世界坐标系下的轴对齐包围盒（AABB） */
  getWorldAABB(store: { getById(id: string): BaseElement | undefined }) {
    const pts = this.getWorldCorners(store)
    const xs = pts.map((p) => p.x)
    const ys = pts.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }


  move(dx: number, dy: number) {
    // 在父坐标系下平移（拖拽通常需要这个语义）
    this.matrix = translateBy(this.matrix, dx, dy)
  }

  resize(newWidth: number, newHeight: number) {
    this.width = newWidth
    this.height = newHeight
  }

  showName(
    ctx: CanvasRenderingContext2D,
  ) {
    if (!this.name || !this.visible) return

    const nameConfig = elementConfig.name
    ctx.save()
    // ctx.restore()


    // 设置字体
    ctx.font = `${nameConfig.fontSize}px ${nameConfig.fontFamily}`
    ctx.textAlign = nameConfig.textAlign
    ctx.textBaseline = 'top'

    // 测量文本尺寸
    // const textMetrics = ctx.measureText(this.name)

    // 计算文本位置（居中显示在元素上方）
    // 使用缓存的 worldMatrix（e,f 即局部原点在世界坐标的位置）
    const wm = this._worldMatrix
    const worldX = wm[4]
    const worldY = wm[5]
    // world -> screen（renderName 在 render() 的 ctx.restore() 之后调用，此时 ctx 为屏幕坐标系）
    const textX = worldX - (nameConfig.offsetX ?? 0)
    const textY = worldY - (nameConfig.offsetY ?? 0)

    // 绘制文本描边（提高对比度）
    if (nameConfig.strokeWidth > 0) {
      ctx.strokeStyle = nameConfig.strokeColor
      ctx.lineWidth = nameConfig.strokeWidth
      ctx.strokeText(this.name, textX, textY)
    }

    // 绘制文本
    ctx.fillStyle = this.isSelected ? '#1890ff' : nameConfig.color
    ctx.fillText(this.name, textX, textY)

    ctx.restore()
  }
  render(
    ctx: CanvasRenderingContext2D,
    store: { getById(id: string): BaseElement | undefined }
  ) {
    if (!this.visible) return

    // 把 ctx 切换到当前元素的局部坐标系（支持父子层级与任意 matrix）
    ctx.save()
    ctx.transform(...this.matrix)

    this.draw(ctx)
    // this.showName(ctx, dx, dy)
    if (this.children) {
      for (const child of this.children) {
        const childElement = store.getById(child)
        if (childElement) {
          childElement.render(ctx, store)
        }
      }
    }

    ctx.restore()
  }

  getBoundingBox() {
    return {
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
    }
  }
  setVisible(visible: boolean) {
    this.visible = visible
  }
  setName(name: string) {
    this.name = name
  }
  setSelected(selected: boolean) {
    this.isSelected = selected
  }
  setWidth(width: number) {
    this.width = width
  }
  setHeight(height: number) {
    this.height = height
  }
  setMatrix(matrix: Matrix) {
    this.matrix = matrix
  }
  /**
   * 仅修改平移分量（保持缩放/旋转/斜切不变）
   * - 适合创建矩形时用“左上角定位”快速更新位置
   */
  setTranslation(x: number, y: number) {
    this.matrix = setTranslation(this.matrix, x, y)
  }
  getNodeInfo() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      visible: this.visible,
      parentId: this.parentId,
      children: [] as EleTreeNode[],
      locked: false,

    }
  }
  getAttr() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      visible: this.visible,
      parentId: this.parentId,
      width: this.width,
      height: this.height,
      matrix: this.matrix,
      children: [] as any[],

    }
  }
  setAttr(attr: any) {
    this.id = attr.id
    this.name = attr.name
    this.type = attr.type
    this.visible = attr.visible
    this.parentId = attr.parentId
    this.width = attr.width
    this.height = attr.height

    // 兼容迁移：优先使用 matrix，否则从 x/y/rotation 生成
    if (Array.isArray(attr.matrix) && attr.matrix.length === 6) {
      this.matrix = attr.matrix as Matrix
    } else {
      this.matrix = composeTR(attr.x ?? 0, attr.y ?? 0, attr.rotation ?? 0)
    }
    this.children = attr.children
  }

  /**
   * 命中检测（默认按“局部矩形 [0,w]x[0,h]”做检测）
   * - 若传入 store：会按世界矩阵做逆变换，支持父子层级与 rotation
   * - 若不传 store：保持旧逻辑（仅适用于未旋转/未嵌套时的快速判断）
   */
  hitTest(
    px: number,
    py: number,
    store?: { getById(id: string): BaseElement | undefined }
  ): boolean {
    const inv = store ? this.getInverseWorldMatrix(store) : invert(this.matrix)
    if (!inv) return false
    const local = applyToPoint(inv, { x: px, y: py })
    if (!local) return false
    return (
      local.x >= 0 &&
      local.x <= this.width &&
      local.y >= 0 &&
      local.y <= this.height
    )
  }
}