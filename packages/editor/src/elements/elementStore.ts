
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
  private hierarchyChangedListeners: Set<(root: EleTreeNode[]) => void> = new Set()
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
   * 统一根层语义：parentId === null 表示在 root（根层）
   * 历史代码里可能会出现 parentId === 'root'，这里统一当作 null 处理。
   */
  private normalizeParentId(parentId: string | null | undefined): string | null {
    if (!parentId) return null
    return parentId === this.ROOT_ID ? null : parentId
  }

  /**
   * 添加元素：默认插入到根节点末尾
   * - 会触发：层级变化 + 元素变化
   */
  add(el: BaseElement, parentId: string | null = null, index?: number) {
    const actualParentId = this.normalizeParentId(parentId)

    // 1) 写入元素对象
    this.elements.set(el.id, el)

    // 2) 写入节点（层级/顺序）
    const node = el.getNodeInfo()
    this.nodeMap.set(node.id, node)

    // 3) 挂到父节点 children（顺序）
    node.parentId = actualParentId
    this.insertChild(actualParentId, node.id, index)



    if (!this.isHydrating) {
      this.saveLocal()
      this.emitHierarchyChanged()
      // this.emitElementsChanged()
    }
  }

  /**
   * 删除节点（包含子树）
   * - 会触发：层级变化 + 元素变化
   */
  remove(id: string) {
    const node = this.getNodeById(id)
    if (!node) return

    // 1) 从父节点 children 中移除
    const oldParentId = this.normalizeParentId(node.parentId)
    if (oldParentId === null) {
      this.root = this.root.filter((n) => n.id !== id)
    } else {
      const parentNode = this.getNodeById(oldParentId)
      if (parentNode) {
        parentNode.children = parentNode.children.filter((n) => n.id !== id)
      }
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
    return Array.from(this.root)
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
    const node = this.getNodeById(id)
    if (!node) return

    const oldParentId = this.normalizeParentId(node.parentId)
    const targetParentId = this.normalizeParentId(newParentId)
    if (oldParentId === targetParentId) return

    // 1) 从旧父节点移除（root 或 parent.children）
    if (oldParentId === null) {
      this.root = this.root.filter((n) => n.id !== id)
    } else {
      const oldParentNode = this.getNodeById(oldParentId)
      if (oldParentNode) {
        oldParentNode.children = oldParentNode.children.filter((n) => n.id !== id)
      }
    }
    console.log('移动----newParentId', newParentId)
    if (!newParentId) {
      this.root.push(node)
      return
    }
    const newParentNode = this.getNodeById(newParentId)
    newParentNode?.children.push(node)
    // 2) 插入到新父节点（root 或 parent.children）
    // this.insertChild(newParentId, id, index)
    node.parentId = newParentId


    console.log('更新----node', this.root)
    if (!this.isHydrating) {
      this.saveLocal()
      this.emitHierarchyChanged()
      // move 不一定改变元素对象，但为了让 UI/渲染立即反映层级变化，也触发一次元素变化
      // this.emitElementsChanged()
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
  onHierarchyChange(cb: (root: EleTreeNode[]) => void) {
    cb(this.root)
    this.hierarchyChangedListeners.add(cb)
    return () => this.hierarchyChangedListeners.delete(cb)
  }
  private emitHierarchyChanged() {

    this.hierarchyChangedListeners.forEach((cb) => cb(this.root))
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
      console.log('tree', tree)
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
  hitTopExcludeSelected(x: number, y: number) {
    if (!this.selectedElement) return null

    const selectedId = this.selectedElement
    const selectedNode = this.getNodeById(selectedId)
    if (!selectedNode) return null

    // 目标：拖拽过程中判断是否需要变更 parentId
    // 规则：
    // - 优先命中“当前父节点”（避免在父容器内拖动时频繁变更）
    // - 否则命中“根层最上方的容器节点”（按 root 顺序从上到下）
    // - 排除自己（不能把自己设为自己的 parent）
    const currentParentId = this.normalizeParentId(selectedNode.parentId)

    // 1) 先看当前父节点是否命中
    if (currentParentId) {
      const parentNode = this.getNodeById(currentParentId)
      const parentEl = parentNode ? this.getById(parentNode.id) : undefined
      if (parentNode?.visible && parentEl?.hitTest(x, y)) {
        return null // 仍在父容器内，不变更
      }
    }

    // 2) 再从根层（上层优先）找新的父节点
    let newParentId: string | null = null
    for (let i = 0; i < this.root.length; i++) {
      const node = this.root[i]
      if (!node?.visible) continue
      if (node.id === selectedId) continue
      const el = this.getById(node.id)
      if (el?.hitTest(x, y)) {
        newParentId = node.id
        break
      }
    }

    // 3) 统一 parentId 语义并执行变更
    const normalizedNewParentId = this.normalizeParentId(newParentId)
    if (normalizedNewParentId === currentParentId) return null
    if (normalizedNewParentId === selectedId) return null

    // this.moveNode(selectedId, normalizedNewParentId)
    return normalizedNewParentId
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


  private insertChild(parentId: string | null, childId: string, index?: number) {
    const childNode = this.nodeMap.get(childId)
    if (!childNode) return

    const pid = this.normalizeParentId(parentId)
    if (pid === null) {
      // 根层插入：root 是节点数组，顺序即 root 顺序
      this.root = this.root.filter((n) => n.id !== childId)
      const i =
        index === undefined || index < 0 || index > this.root.length
          ? this.root.length
          : index
      this.root.splice(i, 0, childNode)
      return
    }

    const parentNode = this.getNodeById(pid)
    if (!parentNode) {
      // 父节点不存在，兜底挂根
      this.insertChild(null, childId, index)
      childNode.parentId = null
      return
    }

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
  onChange(cb: (root: EleTreeNode[]) => void) {
    // 只立即触发一次，避免重复回调
    cb(this.root)

    const hierarchyCb = (_root: EleTreeNode[]) => cb(this.root)
    this.hierarchyChangedListeners.add(hierarchyCb)

    return () => {
      this.hierarchyChangedListeners.delete(hierarchyCb)
    }
  }
}
