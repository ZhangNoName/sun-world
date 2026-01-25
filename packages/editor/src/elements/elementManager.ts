import type { BaseElement } from './baseElement.class'
import { RectElement } from './react'
import { GroupElement } from './group'
import { ElementType } from './element.config'
import { EleName } from './name'
import { identity, invert, multiply } from '../utils/matrix'
import { IBox, IPoint, Matrix } from '../types/common.type'
import { intersectBox, isPointInBox } from '../utils/common'

type PersistedV1 = {
  version: 1
  updatedAt: number
  data: any[]
}

export class ElementManager {
  private eleName = new EleName()
  private storageKey = 'editor-data'
  private store: Map<string, BaseElement> = new Map()

  /**
   * 框选矩形（画布坐标系 / 世界坐标系下的轴对齐矩形）
   * - 仅用于交互态展示与范围选择，不会持久化
   */
  private marqueeRect: IBox | null = null
  /**
   * 选中矩形（画布坐标系 / 世界坐标系下的轴对齐矩形）
   * - 仅用于交互态展示与范围选择，不会持久化
   */
  private selectedBox: IBox | null = null

  private hierarchyChangedListeners: Set<(rootChildren: BaseElement[]) => void> =
    new Set()
  private elementsChangedListeners: Set<(elements: BaseElement[]) => void> =
    new Set()

  private selectedElementIds: string[] = []
  public readonly ROOT_ID = 'root'

  /**
   * 统一的根节点：所有“根层元素”的 parentId 都指向它（ROOT_ID）
   */
  private root: GroupElement = new GroupElement({
    id: this.ROOT_ID,
    name: '根节点',
    type: ElementType.Group,
    visible: true,
    locked: false,
    isSelected: false,
    parentId: null,
    width: 0,
    height: 0,
  } as any)

  private isHydrating = false

  constructor() {

    this.store.set(this.ROOT_ID, this.root)
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
    if (!parentId || parentId === '') return this.ROOT_ID
    return parentId
  }


  add(el: BaseElement, parentId: string = this.ROOT_ID, index?: number) {
    const pid = this.normalizeParentId(parentId)
    const parent = this.store.get(pid)
    if (!parent) return

    this.store.set(el.id, el)
    el.parentId = pid

    this.insertChild(pid, el.id, index)

    if (!this.isHydrating) {
      this.emitHierarchyChanged()
    }
  }

  remove(id: string) {
    if (id === this.ROOT_ID) return
    const el = this.store.get(id)
    if (!el) return

    // 从父节点移除
    const pid = this.normalizeParentId(el.parentId)
    const parent = this.store.get(pid)
    if (parent) {
      parent.children = parent.children.filter((c) => c.id !== id)
    }

    // BFS 删除子树
    const q: BaseElement[] = [el]
    while (q.length) {
      const cur = q.shift()!
      q.push(...cur.children)
      this.store.delete(cur.id)
    }
    this.selectedElementIds = this.selectedElementIds.filter(sid => sid !== id)

    if (!this.isHydrating) {

      this.emitHierarchyChanged()
    }
  }

  getAll() {
    return Array.from(this.store.values()).filter(el => el.id !== this.ROOT_ID)
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
  clearSelectedBox() {
    this.selectedBox = null
  }
  calcSelectBox() {
    if (this.selectedElements.length === 0) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let hasValidBox = false;

    for (const element of this.selectedElements) {
      const box = element?.box;
      if (!box) continue;

      if (box.minX < minX) minX = box.minX;
      if (box.maxX > maxX) maxX = box.maxX;
      if (box.minY < minY) minY = box.minY;
      if (box.maxY > maxY) maxY = box.maxY;

      hasValidBox = true;
    }

    this.selectedBox = hasValidBox ? { minX, maxX, minY, maxY } : null

  }


  getRootElements() {
    return this.root.children
  }

  getById(id: string) {
    return this.store.get(id)
  }

  /**
   * 变更层级：把节点挂到新的 parent 下（根层也用 ROOT_ID 表示）
   */
  moveNode(id: string, newParentId?: string | null, index?: number) {
    this.moveNodes([id], newParentId ?? this.ROOT_ID, index)
  }

  /**
   * 批量移动节点到同一个 parent
   * - 会自动过滤掉“父子同时被选中”情况下的子节点（只移动最上层的选中节点）
   * - 会保持世界矩阵不变（insertChild 内部会重算 local matrix）
   * - 每次移动都只会移动同一个层级的节点，也就是父元素
   */
  moveNodes(ids: string[], newParentId: string, index?: number) {

    const targetParentId = this.normalizeParentId(newParentId)
    const oldParent = this.store.get(ids[0])?.parent
    const targetParent = this.store.get(targetParentId)
    if (!targetParent || !oldParent) {
      console.log('移动节点- 目标父元素或旧父元素不存在', targetParentId, oldParent)
      return
    }
    const oldParentWorldMatrix = oldParent.worldMatrix
    oldParent.children = oldParent.children.filter((c) => !ids.includes(c.id))
    console.log('移动节点- 旧父元素', oldParent.id, oldParent.children)
    // 插入到新父节点
    let insertAt = index ?? 0
    for (const id of ids) {
      const el = this.store.get(id)
      if (!el) continue
      targetParent.addChild(el)
    }

    if (!this.isHydrating) {

      this.emitHierarchyChanged()
    }
  }
  // 元素更新后调用（几何/样式变化）
  update() {
    // this.emitElementsChanged()
    if (!this.isHydrating) {

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

  onHierarchyChange(cb: (rootChildren: BaseElement[]) => void) {
    cb(this.root.children)
    this.hierarchyChangedListeners.add(cb)
    return () => this.hierarchyChangedListeners.delete(cb)
  }
  private emitHierarchyChanged() {
    this.hierarchyChangedListeners.forEach((cb) => cb(this.root.children))
    this.emitElementsChanged()
  }

  saveLocal() {
    const data: PersistedV1 = {
      version: 1,
      updatedAt: Date.now(),
      data: this.root.children.map(c => c.toJSON()),
    }
    localStorage.setItem(this.storageKey, JSON.stringify(data))
    console.log('保存成功')
  }

  loadLocal() {
    try {
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as PersistedV1
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.data)) return

      // 重建
      this.store.clear()
      this.root.children = []
      this.store.set(this.ROOT_ID, this.root)
      this.selectedElementIds = []

      const createElement = (item: any): BaseElement => {
        let el: BaseElement
        if (item.type === ElementType.Group) {
          el = new GroupElement({
            id: item.id,
            parentId: this.normalizeParentId(item.parentId),
            name: item.name,
            width: item.width,
            height: item.height,
            transform: item.transform,
          })
        } else {
          el = new RectElement({
            id: item.id,
            parentId: this.normalizeParentId(item.parentId),
            name: item.name,
            width: item.width,
            height: item.height,
            transform: item.transform,
            fill: item.fill,
          })
        }
        // this.add(el, el.parentId)
        // el.updateAttrs(item)

        if (Array.isArray(item.children)) {
          for (const childAttr of item.children) {
            const childEl = createElement(childAttr)
            el.children.push(childEl)
            this.store.set(childEl.id, childEl)
          }
        }
        return el
      }

      for (const item of parsed.data) {
        const el = createElement(item)
        this.store.set(el.id, el)
        this.root.addChild(el)
      }
    } finally {
      this.isHydrating = false
    }

    this.emitHierarchyChanged()
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
    return this.selectedElementIds.length > 0
  }

  selectByMarquee(x1: number, y1: number, x2: number, y2: number) {
    this.selectedElementIds = []
    this.selectedBox = null
    this.hitTestNodeListByRect(this.root.children)
    return this.selectedElementIds.length > 0
  }

  private hitTestNodeListByRect(elements: BaseElement[]) {
    const areaBox = this.getMarqueeRect()
    if (!areaBox) return
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]
      if (!el.visible) continue

      const aabb = el.box
      if (aabb && intersectBox(areaBox, aabb)) {
        this.selectedElementIds.push(el.id)
        this.updateSelectBox(aabb)
      }
      if (el.children.length > 0) {
        this.hitTestNodeListByRect(el.children)
      }
    }
  }

  private updateSelectBox(newBox: IBox) {
    if (!this.selectedBox) {
      this.selectedBox = { ...newBox }
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

  private hitTestNodeList(elements: BaseElement[]) {
    const areaBox = this.getMarqueeRect()
    this.selectedElementIds = []
    this.selectedBox = null
    if (!areaBox) return
    const walk = (els: BaseElement[]) => {

      for (const el of els) {
        if (!el.visible) continue
        const aabb = el.box
        // console.log('hitTestNodeList', el.id, aabb)
        if (aabb && intersectBox(areaBox, aabb)) {
          // console.log('hitTestNodeList', el.id)
          this.selectedElementIds.push(el.id)
          // el.isSelected = true
          this.updateSelectBox(aabb)
        }
        if (el.children.length > 0) {
          walk(el.children)
        }
      }
    }
    walk(elements)
  }

  // 排除掉选中的元素有没有在其他元素里面，如果有，则返回该元素的父元素id
  hitTopExcludeSelected(x: number, y: number) {
    if (!this.selectedElementIds.length) return null
    const selectedId = this.selectedElementIds[0]
    const selectedEl = this.store.get(selectedId)
    if (!selectedEl) return null

    const currentParentId = this.normalizeParentId(selectedEl.parentId)
    const currentParentEl = this.store.get(currentParentId)

    const selectedIdsSet = new Set(this.selectedElementIds)

    if (currentParentEl && currentParentId !== this.ROOT_ID) {
      const aabb = currentParentEl.box
      if (aabb && isPointInBox(aabb, { x, y })) {
        return currentParentId
      }
    }

    let newParentId: string = this.ROOT_ID
    const dfs = (el: BaseElement): string | null => {
      if (el.id !== this.ROOT_ID) {
        if (selectedIdsSet.has(el.id)) return null
        if (!el.visible) return null
        const aabb = el.box
        if (!aabb || !isPointInBox(aabb, { x, y })) return null
      }

      for (const child of el.children) {
        const res = dfs(child)
        if (res) return res
      }
      return el.id
    }
    const result = dfs(this.root)
    if (result && result !== currentParentId) {
      this.moveNodes(this.selectedElementIds, result)
      return result
    }
    return null
  }
  get selectedIds() {
    return this.selectedElementIds
  }

  get selectedElements() {
    return this.selectedElementIds.map(o => this.store.get(o))
  }
  setSelectedElement(id: string) {
    if (!this.selectedElementIds.includes(id)) {
      this.selectedElementIds.push(id)
    }
  }
  clearSelectedElement() {
    this.selectedElementIds = []
  }

  private insertChild(parentId: string, elementId: string, index?: number) {
    const pid = this.normalizeParentId(parentId)
    const parent = this.store.get(pid)
    const child = this.store.get(elementId)

    if (!parent || !child) return

    const childWorld = child.worldMatrix
    const parentWorld = pid === this.ROOT_ID ? identity() : parent.worldMatrix
    const invParent = invert(parentWorld)

    if (invParent) {
      const newLocal = multiply(invParent, childWorld)
      child.updateAttrs({ transform: newLocal })
      child.markDirty(this)
    }

    parent.children = parent.children.filter((c) => c.id !== elementId)
    const i = (index === undefined || index < 0 || index > parent.children.length)
      ? parent.children.length
      : index
    parent.children.splice(i, 0, child)
  }

  moveSelectedElement(dx: number, dy: number) {
    for (const el of this.selectedElements) {
      if (el) {
        el.move(dx, dy)
      }
    }
  }

  renderAll(ctx: CanvasRenderingContext2D) {
    // console.log('renderAll', this.root.children)
    for (const el of this.root.children) {
      el.render(ctx)
    }
  }
}
