import type { BaseElement } from './baseElement.class'
import { RectElement } from './react'
import { ElementType } from './element.config'
import { EleName } from './name'

export interface EleTreeNode {
  id: string
  name: string
  type: ElementType
  visible: boolean
  locked: boolean
  /**
   * 统一语义：
   * - 根节点（id === 'root'）：parentId === null
   * - 其它节点：parentId 永远有值（默认 'root'）
   */
  parentId: string | null
  children: EleTreeNode[]
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

  private hierarchyChangedListeners: Set<(rootChildren: EleTreeNode[]) => void> =
    new Set()
  private elementsChangedListeners: Set<(elements: BaseElement[]) => void> =
    new Set()

  private selectedElement: string | null = null
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

  private rebuildElementRelations() {
    // 让 BaseElement.parentId/children 与 node 树保持一致（渲染/名字定位需要）
    for (const el of this.elements.values()) {
      el.parentId = null
      el.children = null
    }

    for (const [id, node] of this.nodeMap.entries()) {
      if (id === this.ROOT_ID) continue
      const el = this.elements.get(id)
      if (!el) continue
      el.parentId = node.parentId // 根层为 'root'
      el.children = node.children.length > 0 ? node.children.map((c) => c.id) : null
      el.visible = node.visible
      el.name = node.name
    }
  }

  add(el: BaseElement, parentId?: string | null, index?: number) {
    const pid = this.normalizeParentId(parentId)
    const parentNode = this.getNode(pid)
    console.log('add', el.id, pid, parentNode)
    if (!parentNode) return

    this.elements.set(el.id, el)

    const node = el.getNodeInfo() as EleTreeNode
    if (!node) return
    console.log('新增的node节点', el, node)
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
      if (this.selectedElement === cur.id) this.selectedElement = null
    }

    this.rebuildElementRelations()
    if (!this.isHydrating) {
      this.saveLocal()
      this.emitHierarchyChanged()
      // this.emitElementsChanged()
    }
  }

  getAll() {
    return Array.from(this.elements.values())
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
      // 统一保存 parentId（根层为 ROOT_ID）
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

      // 重建：保留 root，自顶向下恢复 children
      this.elements.clear()
      this.nodeMap.clear()
      this.root.children = []
      this.nodeMap.set(this.ROOT_ID, this.root)
      this.selectedElement = null

      const createElement = (attr: any) => {
        // 目前只有 Rect，后续可按 attr.type 分发
        const el = new RectElement({
          x: attr?.x ?? 0,
          y: attr?.y ?? 0,
          width: attr?.width ?? 0,
          height: attr?.height ?? 0,
          fill: attr?.fill,
        } as any)
        el.setAttr({ ...attr, children: null })
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

  /**
   * 命中检测：返回是否命中，并更新 selectedElement 为最上层命中节点
   */
  hitTest(x: number, y: number) {
    const hitId = this.hitTestNodeList(this.root.children, x, y)
    if (hitId) {
      this.selectedElement = hitId
      return true
    }
    this.selectedElement = null
    return false
  }

  private hitTestNodeList(nodes: EleTreeNode[], x: number, y: number): string | null {
    // 从后往前：后面的更上层
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]
      if (!n.visible) continue

      // 子节点优先
      if (n.children.length) {
        const childHit = this.hitTestNodeList(n.children, x, y)
        if (childHit) return childHit
      }

      const el = this.elements.get(n.id)
      if (el?.hitTest(x, y)) return n.id
    }
    return null
  }

  /**
   * 拖拽过程中判断是否需要改变 parentId：
   * - 返回新的 parentId（没变化则返回 null）
   */
  hitTopExcludeSelected(x: number, y: number) {
    if (!this.selectedElement) return null
    const selectedId = this.selectedElement
    const selectedNode = this.getNode(selectedId)
    if (!selectedNode) return null

    // 先命中“当前父容器”则不变
    const currentParentId = this.normalizeParentId(selectedNode.parentId)
    const currentParentNode = this.getNode(currentParentId)
    const currentParentEl = currentParentNode
      ? this.elements.get(currentParentNode.id)
      : undefined
    if (currentParentNode && currentParentNode.id !== this.ROOT_ID) {
      if (currentParentNode.visible && currentParentEl?.hitTest(x, y)) return null
    }

    // 根层从上到下找命中的父（排除自己和自己子树）
    let newParentId: string = this.ROOT_ID
    for (let i = this.root.children.length - 1; i >= 0; i--) {
      const node = this.root.children[i]
      if (!node.visible) continue
      if (node.id === selectedId) continue
      if (this.isDescendant(node, selectedId)) continue
      const el = this.elements.get(node.id)
      if (el?.hitTest(x, y)) {
        newParentId = node.id
        break
      }
    }

    if (newParentId === currentParentId) return null
    this.moveNode(selectedId, newParentId)
    return newParentId
  }

  getSelectedElement() {
    return this.selectedElement ? this.getById(this.selectedElement) : null
  }
  setSelectedElement(id: string) {
    this.selectedElement = id
  }
  clearSelectedElement() {
    this.selectedElement = null
  }

  private insertChild(parentId: string, nodeId: string, index?: number) {
    const parentNode = this.getNode(this.normalizeParentId(parentId))
    const childNode = this.getNode(nodeId)

    if (!parentNode || !childNode) return

    // 去重
    parentNode.children = parentNode.children.filter((c) => c.id !== nodeId)

    const i =
      index === undefined || index < 0 || index > parentNode.children.length
        ? parentNode.children.length
        : index
    parentNode.children.splice(i, 0, childNode)
    // childElement.updatePosition(parentElement.x, parentElement.y)
  }

  getFrame() {
    const frame: string[] = []
    for (const node of this.nodeMap.values()) {
      if (node.id === this.ROOT_ID) continue
      if (node.visible && node.type === ElementType.Rect) frame.push(node.id)
    }
    return frame
  }
}
