import type { BaseElement } from './baseElement.class'
import { RectElement } from './react'
import { ElementType } from './element.config'
import { EleName } from './name'
import { identity, invert, multiply } from '../utils/matrix'
import { IBox, IPoint, IRect } from '../types/common.type'
import { intersectBox } from '../utils/common'

export class EleTreeNode {
  id!: string
  name!: string
  type!: ElementType
  visible!: boolean
  locked!: boolean
  isSelected!: boolean
  _isDirty: boolean = false
  /**
   * 统一语义：
   * - 根节点（id === 'root'）：parentId === null
   * - 其它节点：parentId 永远有值（默认 'root'）
   */
  parentId!: string | null
  children!: EleTreeNode[]
}

type PersistedV1 = {
  version: 1
  updatedAt: number
  data: any[]
}

export class ElementStore {
  private eleName = new EleName()
  private storageKey = 'editor-data'
  private elements: Map<string, BaseElement> = new Map()
  private nodeMap: Map<string, EleTreeNode> = new Map()


  /**
   * 框选矩形（画布坐标系 / 世界坐标系下的轴对齐矩形）
   * - 仅用于交互态展示与范围选择，不会持久化
   */
  private marqueeRect: IBox | null =
    null
  /**
   * 选中矩形（画布坐标系 / 世界坐标系下的轴对齐矩形）
   * - 仅用于交互态展示与范围选择，不会持久化
   */
  private selectedBox: IBox | null =
    null

  private hierarchyChangedListeners: Set<(rootChildren: EleTreeNode[]) => void> =
    new Set()
  private elementsChangedListeners: Set<(elements: BaseElement[]) => void> =
    new Set()

  private selectedElement: string[] = []
  public readonly ROOT_ID = 'root'

  /**
   * 统一的根节点：所有“根层元素”的 parentId 都指向它（ROOT_ID）
   */
  private root: EleTreeNode = {
    id: this.ROOT_ID,
    name: '根节点',
    type: ElementType.Group,
    visible: true,
    locked: false,
    isSelected: false,
    _isDirty: false,
    parentId: null,
    children: [],
  }

  private isHydrating = false

  constructor() {
    this.nodeMap.set(this.ROOT_ID, this.root)
    this.loadLocal()
  }

  public generateName(type: ElementType) {
    return this.eleName.getName(type)
  }
  /**
   * 将 parentId 统一为“必定存在的父节点 id”
   * - null/undefined/'' => ROOT_ID
   */
  private normalizeParentId(parentId?: string | null): string {
    if (!parentId) return this.ROOT_ID
    return parentId
  }

  private getNode(id: string): EleTreeNode | undefined {
    return id === this.ROOT_ID ? this.root : this.nodeMap.get(id)
  }

  /**
   * 计算元素的世界矩阵（把 parent 链上的 TR 叠加起来）
   * 约定：parentId === ROOT_ID 为根，不再继续向上找。
   */
  private getElementWorldMatrix(id: string) {
    const el = this.elements.get(id)
    if (!el) return identity()
    return el.getWorldMatrix(this)
  }

  private rebuildElementRelations() {
    // 让 BaseElement.parentId/children 与 node 树保持一致（渲染/名字定位需要）
    for (const el of this.elements.values()) {
      el.attrs.parentId = null
      el.children = null
    }

    for (const [id, node] of this.nodeMap.entries()) {
      if (id === this.ROOT_ID) continue
      const el = this.elements.get(id)
      if (!el) continue
      el.attrs.parentId = node.parentId // 根层为 'root'
      el.children = node.children.length > 0 ? node.children.map((c) => c.id) : null
      el.attrs.visible = node.visible
      el.attrs.name = node.name
      el.markDirty(this)
    }
  }

  add(el: BaseElement, parentId?: string | null, index?: number) {
    const pid = this.normalizeParentId(parentId)
    const parentNode = this.getNode(pid)
    if (!parentNode) return

    this.elements.set(el.id, el)

    const node = el.getNodeInfo() as EleTreeNode
    if (!node) return
    node.parentId = pid
    node.children = []
    this.nodeMap.set(node.id, node)

    this.insertChild(pid, node.id, index)
    this.rebuildElementRelations()

    if (!this.isHydrating) {
      this.saveLocal()
      this.emitHierarchyChanged()
      this.emitElementsChanged()
    }
  }

  remove(id: string) {
    if (id === this.ROOT_ID) return
    const node = this.getNode(id)
    if (!node) return

    // 从父节点移除
    const parentId = this.normalizeParentId(node.parentId)
    const parentNode = this.getNode(parentId)
    if (parentNode) {
      parentNode.children = parentNode.children.filter((c) => c.id !== id)
    }

    // BFS 删除子树
    const q: EleTreeNode[] = [node]
    while (q.length) {
      const cur = q.shift()!
      q.push(...cur.children)
      this.nodeMap.delete(cur.id)
      this.elements.delete(cur.id)

    }
    this.selectedElement = []


    this.rebuildElementRelations()
    if (!this.isHydrating) {
      this.saveLocal()
      this.emitHierarchyChanged()
    }
  }

  getAll() {
    return Array.from(this.elements.values())
  }

  getMarqueeRect() {
    return this.marqueeRect
  }
  setMarqueeRect(rect: IBox) {
    this.marqueeRect = rect
    this.hitTest()
  }
  clearMarqueeRect() {
    this.marqueeRect = null
  }
  getSelectedBox() {
    return this.selectedBox
  }

  getRootElements() {
    return this.root.children
      .map((node) => this.elements.get(node.id))
      .filter((el): el is BaseElement => el !== undefined)
  }

  getById(id: string) {
    return this.elements.get(id)
  }

  getNodeById(id: string) {
    return this.getNode(id)
  }

  /**
   * 变更层级：把节点挂到新的 parent 下（根层也用 ROOT_ID 表示）
   */
  moveNode(id: string, newParentId?: string | null, index?: number) {
    if (id === this.ROOT_ID) return
    const node = this.getNode(id)
    if (!node) return

    const targetParentId = this.normalizeParentId(newParentId)
    if (targetParentId === id) return
    if (node.parentId === targetParentId) return

    // 不允许移动到自己的子树里
    const targetParentNode = this.getNode(targetParentId)
    if (!targetParentNode) return
    if (this.isDescendant(targetParentNode, id)) return

    // 从旧父节点移除
    const oldParentNode = this.getNode(this.normalizeParentId(node.parentId))
    if (oldParentNode) {
      oldParentNode.children = oldParentNode.children.filter((c) => c.id !== id)
    }

    // 插入新父节点
    node.parentId = targetParentId
    this.insertChild(targetParentId, id, index)
    this.rebuildElementRelations()

    if (!this.isHydrating) {
      this.saveLocal()
      this.emitHierarchyChanged()
      this.emitElementsChanged()
    }
  }

  private isDescendant(parent: EleTreeNode, possibleDescendantId: string): boolean {
    const q: EleTreeNode[] = [...parent.children]
    while (q.length) {
      const cur = q.shift()!
      if (cur.id === possibleDescendantId) return true
      q.push(...cur.children)
    }
    return false
  }

  updateNodeMeta(
    id: string,
    meta: Partial<Pick<EleTreeNode, 'name' | 'visible' | 'locked'>>
  ) {
    if (id === this.ROOT_ID) return
    const node = this.getNode(id)
    if (!node) return
    if (meta.name !== undefined) node.name = meta.name
    if (meta.visible !== undefined) node.visible = meta.visible
    if (meta.locked !== undefined) node.locked = meta.locked

    this.rebuildElementRelations()

    if (!this.isHydrating) {
      this.saveLocal()
      this.emitElementsChanged()
      this.emitHierarchyChanged()
    }
  }

  // 元素更新后调用（几何/样式变化）
  update() {
    if (!this.isHydrating) {
      this.saveLocal()
      this.emitElementsChanged()
    }
  }

  onElementsChange(cb: (elements: BaseElement[]) => void) {
    cb(this.getAll())
    this.elementsChangedListeners.add(cb)
    return () => this.elementsChangedListeners.delete(cb)
  }
  private emitElementsChanged() {
    this.elementsChangedListeners.forEach((cb) => cb(this.getAll()))
  }

  onHierarchyChange(cb: (rootChildren: EleTreeNode[]) => void) {
    cb(this.root.children)
    this.hierarchyChangedListeners.add(cb)
    return () => this.hierarchyChangedListeners.delete(cb)
  }
  private emitHierarchyChanged() {
    this.hierarchyChangedListeners.forEach((cb) => cb(this.root.children))
  }

  saveLocal() {
    const buildTree = (node: EleTreeNode): any => {
      const el = this.elements.get(node.id)
      if (!el) return null
      const attr = el.getAttr()
      attr.children = node.children.map(buildTree).filter(Boolean)
      attr.parentId = node.parentId
      return attr
    }

    const data: PersistedV1 = {
      version: 1,
      updatedAt: Date.now(),
      data: this.root.children.map(buildTree).filter(Boolean),
    }
    localStorage.setItem(this.storageKey, JSON.stringify(data))
  }

  loadLocal() {
    this.isHydrating = true
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as PersistedV1
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.data)) return

      // 重建
      this.elements.clear()
      this.nodeMap.clear()
      this.root.children = []
      this.nodeMap.set(this.ROOT_ID, this.root)
      this.selectedElement = []

      const createElement = (attr: any) => {
        const el = new RectElement({
          id: attr?.id ?? this.generateName(ElementType.Rect),
          parentId: this.normalizeParentId(attr?.parentId),
          name: attr?.name ?? this.generateName(ElementType.Rect),
          width: attr?.width ?? 0,
          height: attr?.height ?? 0,
          matrix: attr?.matrix,
          fill: attr?.fill,
        })
        el.setAttr({ ...attr, children: null }, this)
        return el
      }

      const walk = (arr: any[], parentId: string, parentNode: EleTreeNode) => {
        for (const item of arr) {
          if (!item?.id) continue
          const el = createElement(item)
          this.elements.set(el.id, el)

          const node: EleTreeNode = {
            id: el.id,
            name: el.name ?? '',
            type: el.type ?? ElementType.Rect,
            visible: el.visible ?? true,
            locked: false,
            _isDirty: false,
            parentId,
            children: [],
          }
          this.nodeMap.set(node.id, node)
          parentNode.children.push(node)

          if (Array.isArray(item.children) && item.children.length) {
            walk(item.children, node.id, node)
          }
        }
      }

      walk(parsed.data, this.ROOT_ID, this.root)
      this.rebuildElementRelations()
    } finally {
      this.isHydrating = false
    }

    this.emitHierarchyChanged()
    this.emitElementsChanged()
  }
  // 是否点击在选中框内，只有鼠标按下的时候计算
  hitSelectBox(point: IPoint) {
    const { x, y } = point
    if (!this.selectedBox) {
      return false
    }
    return x >= this.selectedBox.minX && x <= this.selectedBox.maxX && y >= this.selectedBox.minY && y <= this.selectedBox.maxY
  }

  hitTest() {
    this.hitTestNodeList(this.root.children)
    if (this.selectedElement.length > 0) {
      // console.log('点击到元素', this.selectedElement)
      return true
    }
    return false
  }

  selectByMarquee(x1: number, y1: number, x2: number, y2: number) {
    const minX = Math.min(x1, x2)
    const maxX = Math.max(x1, x2)
    const minY = Math.min(y1, y2)
    const maxY = Math.max(y1, y2)

    const hitId = this.hitTestNodeListByRect(this.root.children,)
    if (hitId) {
      this.selectedElement.push(hitId)
      return true
    }
    this.selectedElement = []
    return false
  }

  private hitTestNodeListByRect(
    nodes: EleTreeNode[],

  ) {

    const areaBox = this.getMarqueeRect()
    if (!areaBox) return null
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      if (!n.visible) continue


      const el = this.elements.get(n.id)
      if (!el) continue
      const aabb = el.getAABB()
      if (intersectBox(areaBox, aabb)) {
        this.selectedElement.push(n.id)
      }
    }
  }
  private updateSelectBox(newBox: IBox) {
    if (!this.selectedBox) {
      this.selectedBox = newBox
      return
    }
    const oldBox = this.selectedBox
    this.selectedBox = {
      minX: Math.min(oldBox.minX, newBox.minX),
      minY: Math.min(oldBox.minY, newBox.minY),
      maxX: Math.max(oldBox.maxX, newBox.maxX),
      maxY: Math.max(oldBox.maxY, newBox.maxY),
    }

  }
  private hitTestNodeList(nodes: EleTreeNode[]) {
    const areaBox = this.getMarqueeRect()
    this.selectedElement = []
    this.selectedBox = null
    if (!areaBox) return null
    for (let n of nodes) {
      if (!n.visible) continue
      const el = this.elements.get(n.id)
      if (!el) continue
      const aabb = el.getAABB()
      if (intersectBox(areaBox, aabb)) {
        this.selectedElement.push(n.id)
        n.isSelected = true
        this.updateSelectBox(aabb)
      }
    }
    return null
  }

  hitTopExcludeSelected(x: number, y: number) {
    if (!this.selectedElement) return null
    const selectedId = this.selectedElement[0]
    const selectedNode = this.getNode(selectedId)
    if (!selectedNode) return null

    const currentParentId = this.normalizeParentId(selectedNode.parentId)
    const currentParentNode = this.getNode(currentParentId)
    const currentParentEl = currentParentNode
      ? this.elements.get(currentParentNode.id)
      : undefined
    if (currentParentNode && currentParentNode.id !== this.ROOT_ID) {
      if (currentParentNode.visible && currentParentEl?.hitTest(x, y, this)) return null
    }

    let newParentId: string = this.ROOT_ID
    for (let i = this.root.children.length - 1; i >= 0; i--) {
      const node = this.root.children[i]
      if (!node.visible) continue
      if (node.id === selectedId) continue
      if (this.isDescendant(node, selectedId)) continue
      const el = this.elements.get(node.id)
      if (el?.hitTest(x, y, this)) {
        newParentId = node.id
        break
      }
    }

    if (newParentId === currentParentId) return null
    this.moveNode(selectedId, newParentId)
    return newParentId
  }

  getSelectedElement() {
    return this.selectedElement
  }
  setSelectedElement(id: string) {
    this.selectedElement.push(id)
  }
  clearSelectedElement() {
    this.selectedElement = []
  }

  private insertChild(parentId: string, nodeId: string, index?: number) {
    const pid = this.normalizeParentId(parentId)
    const parentNode = this.getNode(pid)
    const childNode = this.getNode(nodeId)

    if (!parentNode || !childNode) return

    const childEl = this.elements.get(nodeId)
    if (childEl) {
      const childWorld = this.getElementWorldMatrix(nodeId)
      const parentWorld =
        pid === this.ROOT_ID ? identity() : this.getElementWorldMatrix(pid)
      const invParent = invert(parentWorld)
      if (invParent) {
        const newLocal = multiply(invParent, childWorld)
        childEl.attrs.matrix = newLocal
        childEl.markDirty(this)
      }
    }

    parentNode.children = parentNode.children.filter((c) => c.id !== nodeId)

    const i =
      index === undefined || index < 0 || index > parentNode.children.length
        ? parentNode.children.length
        : index
    parentNode.children.splice(i, 0, childNode)
  }
  moveSelectedElement(dx: number, dy: number) {
    for (const id of this.selectedElement) {
      const el = this.elements.get(id)
      if (el) {
        el.move(dx, dy)
      }
    }
    if (!this.selectedBox) return
    const oldBox = this.selectedBox
    this.selectedBox = {
      minX: oldBox.minX + dx,
      minY: oldBox.minY + dy,
      maxX: oldBox.maxX + dx,
      maxY: oldBox.maxY + dy,
    }
  }
}
