
import type { BaseElement } from './baseElement.class'
import { RectElement } from './react'
import { ElementType } from './element.config'
export interface EleTreeNode {
  id: string,
  name: string,
  type: ElementType,
  visible: boolean,
  locked: boolean,
  parentId: string | null,
  /**
   * 只存子节点 id，顺序即渲染/图层顺序
   */
  children: EleTreeNode[],
}
export class ElementStore {
  private storageKey = 'editor-data'
  private elements: Map<string, BaseElement> = new Map()
  /**
   * 扁平节点表：节点查找 O(1)
   */
  private nodeMap: Map<string, EleTreeNode> = new Map()
  /**
   * 层级变化监听：只关注 parent/children/顺序 等结构变化
   */
  private hierarchyChangedListeners: Set<(root: EleTreeNode) => void> = new Set()
  /**
   * 元素变化监听：关注元素对象（几何/样式）及节点元信息（name/visible/locked）变化
   */
  private elementsChangedListeners: Set<(elements: BaseElement[]) => void> =
    new Set()
  private selectedElement: string | null = null
  /**
   * root 只负责“层级关系 + 顺序关系”
   */
  private root: EleTreeNode[] = []
  private readonly ROOT_ID = 'root'
  private isHydrating = false
  constructor() {

    this.loadLocal()
  }

  /**
   * 添加元素：默认插入到根节点末尾
   * - 会触发：层级变化 + 元素变化
   */
  add(el: BaseElement, parentId: string | null = null, index?: number) {
    const actualParentId = parentId ?? this.ROOT_ID

    // 1) 写入元素对象
    this.elements.set(el.id, el)

    // 2) 写入节点（层级/顺序）
    const node = el.getNodeInfo()
    this.nodeMap.set(node.id, node)

    // 3) 挂到父节点 children（顺序）
    const parentNode = this.getNodeById(actualParentId)
    if (!parentNode) {
      // 父节点不存在则兜底挂根
      this.insertChild(this.ROOT_ID, node.id, index)
      node.parentId = null
    } else {
      this.insertChild(actualParentId, node.id, index)
      node.parentId = actualParentId === this.ROOT_ID ? null : actualParentId
    }



    if (!this.isHydrating) {
      this.saveLocal()
      this.emitHierarchyChanged()
      this.emitElementsChanged()
    }
  }

  /**
   * 删除节点（包含子树）
   * - 会触发：层级变化 + 元素变化
   */
  remove(id: string) {
    if (id === this.ROOT_ID) {
      this.root = this.root.filter((n) => n.id !== id)
      return
    }
    const node = this.getNodeById(id)
    if (!node) return

    // 1) 从父节点 children 中移除

    const parentNode = this.getNodeById(node.parentId!)
    if (parentNode) {
      parentNode.children = parentNode.children.filter((n) => n.id !== id)
    }

    // 2) 删除子树, bfs 广度优先搜索
    const q = [node]
    while (q.length > 0) {
      const current = q.shift()
      if (current) {
        this.nodeMap.delete(current.id)
        this.elements.delete(current.id)
        q.push(...current.children)
      }
    }



    if (!this.isHydrating) {
      this.saveLocal()
      this.emitHierarchyChanged()
      this.emitElementsChanged()
    }
  }

  getAll() {
    return Array.from(this.elements.values())
  }
  getRootElements() {
    return this.root
      .map((node) => this.elements.get(node.id))
      .filter((el): el is BaseElement => el !== undefined)
  }
  getById(id: string) {
    return this.elements.get(id)
  }
  getNodeById(id: string) {

    if (id === this.ROOT_ID) return this.root[0]
    return this.nodeMap.get(id)
  }
  /**
   * 获取某节点的子节点 id（顺序即 children 顺序）
   */
  getChildrenIds(id: string) {
    const node = this.getNodeById(id)
    return node ? [...node.children] : []
  }

  /**
   * 仅变更层级/顺序：移动节点到新父节点/新位置
   */
  moveNode(id: string, newParentId: string | null, index?: number) {
    if (id === this.ROOT_ID) return
    const node = this.getNodeById(id)
    if (!node) return

    const oldParentId = node.parentId ?? this.ROOT_ID
    const targetParentId = newParentId ?? this.ROOT_ID

    // 1) 从旧父节点移除
    const oldParentNode = this.getNodeById(oldParentId)
    if (oldParentNode) {
      oldParentNode.children = oldParentNode.children.filter((n) => n.id !== id)
    }

    // 2) 插入到新父节点
    this.insertChild(targetParentId, id, index)
    node.parentId = targetParentId === this.ROOT_ID ? null : targetParentId



    if (!this.isHydrating) {
      this.saveLocal()
      this.emitHierarchyChanged()
      // move 不一定改变元素对象，但为了让 UI/渲染立即反映层级变化，也触发一次元素变化
      this.emitElementsChanged()
    }
  }

  /**
   * 更新节点元信息（不改层级）
   */
  updateNodeMeta(
    id: string,
    meta: Partial<Pick<EleTreeNode, 'name' | 'visible' | 'locked'>>
  ) {
    if (id === this.ROOT_ID) return
    const node = this.getNodeById(id)
    if (!node) return
    if (meta.name !== undefined) node.name = meta.name
    if (meta.visible !== undefined) node.visible = meta.visible
    if (meta.locked !== undefined) node.locked = meta.locked

    // 同步到元素对象（兼容旧逻辑：渲染直接用 element.visible / element.name）
    const el = this.getById(id)
    if (el) {
      if (meta.name !== undefined) el.name = meta.name
      if (meta.visible !== undefined) el.visible = meta.visible
      // locked 目前 BaseElement 没有字段，仅存在节点层
    }

    if (!this.isHydrating) {
      this.saveLocal()
      this.emitElementsChanged()
    }
  }
  // 元素更新后调用
  update() {
    // 将元素对象（name/visible/type）同步回节点表，保证两边一致
    for (const [id, el] of this.elements.entries()) {
      const node = this.nodeMap.get(id)
      if (!node) continue
      node.name = el.name ?? node.name
      node.visible = el.visible ?? node.visible
      node.type = el.type ?? node.type
    }

    if (!this.isHydrating) {
      this.saveLocal()
      this.emitElementsChanged()
    }
  }
  addElementsChanged(cb: (elements: BaseElement[]) => void) {
    cb(this.getAll())
    this.elementsChangedListeners.add(cb)
  }
  removeElementsChanged(cb: (elements: BaseElement[]) => void) {
    this.elementsChangedListeners.delete(cb)
  }
  /**
   * 新 API：监听元素变化（返回取消订阅）
   */
  onElementsChange(cb: (elements: BaseElement[]) => void) {
    cb(this.getAll())
    this.elementsChangedListeners.add(cb)
    return () => this.elementsChangedListeners.delete(cb)
  }
  private emitElementsChanged() {
    this.elementsChangedListeners.forEach((cb) => cb(this.getAll()))
  }

  /**
   * 监听层级变化（parent/children/顺序）
   */
  onHierarchyChange(cb: (root: EleTreeNode) => void) {

    cb(this.root[0])
    this.hierarchyChangedListeners.add(cb)
    return () => this.hierarchyChangedListeners.delete(cb)
  }
  private emitHierarchyChanged() {

    this.hierarchyChangedListeners.forEach((cb) => cb(this.root[0]))
  }

  saveLocal() {
    const tree = []
    const getTree = (node: EleTreeNode) => {
      const tmpElement = this.elements.get(node.id)
      if (!tmpElement) return
      const tmp = tmpElement.getAttr()
      const next = []
      for (let child of node.children) {

        next.push(getTree(child))
      }
      tmp.children = next
      return tmp
    }
    for (let node of this.root) {
      tree.push(getTree(node))
    }
    localStorage.setItem(this.storageKey, JSON.stringify({
      data: tree,
      version: 1,
      updatedAt: Date.now(),
    }))
  }
  loadLocal() {
    this.isHydrating = true
    try {

      const tree = JSON.parse(localStorage.getItem(this.storageKey) || '{}')
      if (tree.version !== 1) return
      this.root = tree.data
      const loadTree = (tree: any[]) => {
        for (let node of tree) {
          const el = new RectElement(node)
          this.elements.set(node.id, el)
          this.nodeMap.set(node.id, node)
          if (node.children) {
            loadTree(node.children)
          }
        }
      }
      loadTree(this.root)

      // 4) 同步派生关系
      //
    } finally {
      this.isHydrating = false
    }

    // hydrating 完成后统一触发一次
    this.emitHierarchyChanged()
    this.emitElementsChanged()
  }
  hitTest(x: number, y: number) {
    let nodeList: EleTreeNode[] = []
    // 已经被选中的元素直接返回
    if (this.selectedElement && this.getById(this.selectedElement)?.hitTest(x, y)) {
      nodeList = this.getNodeById(this.selectedElement)?.children ?? []
      nodeList.push(this.getNodeById(this.selectedElement)!)
      console.log('已有的元素命中', this.selectedElement)
    } else {
      nodeList = this.root
      console.log('根元素命中', nodeList)
    }

    for (let node of nodeList) {
      if (node.visible && this.getById(node.id)?.hitTest(x, y)) {
        this.selectedElement = node.id
      }
    }
    return !!this.selectedElement

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


  private insertChild(parentId: string, childId: string, index?: number) {
    const childNode = this.nodeMap.get(childId)
    if (!childNode) return
    if (parentId === this.ROOT_ID) {
      this.root.push(childNode)
      return
    }

    const pid = parentId
    const parentNode = this.getNodeById(pid)
    if (!parentNode) return

    // 先去重
    parentNode.children = parentNode.children.filter((n) => n.id !== childId)

    const i =
      index === undefined || index < 0 || index > parentNode.children.length
        ? parentNode.children.length
        : index
    parentNode.children.splice(i, 0, childNode)
  }
  getFrame() {
    const frame = []
    for (let node of this.nodeMap.values()) {
      if (node.visible && node.type === ElementType.Rect) {
        frame.push(node.id)
      }
    }
    return frame
  }


  /**
   * 兼容旧 API：渲染器以前监听 onChange（不区分事件类型）
   * 现在改为同时监听“层级变化”和“元素变化”。
   */
  onChange(cb: (elements: BaseElement[]) => void) {
    // 只立即触发一次，避免重复回调
    cb(this.getAll())

    const hierarchyCb = (_root: EleTreeNode) => cb(this.getAll())
    this.hierarchyChangedListeners.add(hierarchyCb)
    this.elementsChangedListeners.add(cb)

    return () => {
      this.hierarchyChangedListeners.delete(hierarchyCb)
      this.elementsChangedListeners.delete(cb)
    }
  }
}
