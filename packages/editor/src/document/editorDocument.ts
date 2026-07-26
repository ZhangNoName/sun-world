import type { BaseElement } from '../elements/baseElement.class'
import { ElementType, type FillStyle } from '../elements/element.config'
import { GroupElement } from '../elements/group'
import { RectElement } from '../elements/react'
import type { Matrix } from '../types/common.type'

export type DocumentError =
  | 'duplicate-id'
  | 'element-not-found'
  | 'parent-not-found'
  | 'cycle'
  | 'root-operation'
  | 'invalid-version'
  | 'invalid-parent'
  | 'invalid-type'

export type DocumentResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; error: DocumentError }

export interface EditorDocumentNodeSnapshot {
  id: string
  name: string
  type: ElementType
  visible: boolean
  locked: boolean
  parentId: string
  width: number
  height: number
  transform: Matrix
  fill?: FillStyle
  opacity?: number
  children: EditorDocumentNodeSnapshot[]
}

export interface EditorDocumentSnapshotV1 {
  version: 1
  children: EditorDocumentNodeSnapshot[]
}

export interface DetachedSubtree {
  element: BaseElement
  parentId: string
  index: number
}

export class EditorDocument {
  public readonly ROOT_ID = 'root'
  private root = this.createRoot()
  private store = new Map<string, BaseElement>([[this.ROOT_ID, this.root]])

  get rootChildren(): readonly BaseElement[] {
    return this.root.children
  }

  get rootElement(): BaseElement {
    return this.root
  }

  getById(id: string): BaseElement | undefined {
    return this.store.get(id)
  }

  getAll(): BaseElement[] {
    return [...this.store.values()].filter(
      (element) => element.id !== this.ROOT_ID
    )
  }

  getDescendantIds(id: string): string[] {
    const element = this.store.get(id)
    if (!element) return []
    const ids: string[] = []
    const visit = (current: BaseElement) => {
      ids.push(current.id)
      current.children.forEach(visit)
    }
    visit(element)
    return ids
  }

  add(
    element: BaseElement,
    parentId = this.ROOT_ID,
    index?: number
  ): DocumentResult<BaseElement> {
    if (this.containsSubtreeId(element)) {
      return { ok: false, error: 'duplicate-id' }
    }
    const parent = this.store.get(parentId)
    if (!parent) return { ok: false, error: 'parent-not-found' }
    this.attach(element, parent, index)
    this.registerSubtree(element)
    return { ok: true, value: element }
  }

  remove(id: string): DocumentResult<DetachedSubtree> {
    if (id === this.ROOT_ID) return { ok: false, error: 'root-operation' }
    const element = this.store.get(id)
    if (!element) return { ok: false, error: 'element-not-found' }
    const parent = element.parent
    if (!parent) return { ok: false, error: 'parent-not-found' }
    const index = parent.children.findIndex((child) => child.id === id)
    parent.children.splice(index, 1)
    this.unregisterSubtree(element)
    return {
      ok: true,
      value: { element, parentId: parent.id, index },
    }
  }

  restore(subtree: DetachedSubtree): DocumentResult<BaseElement> {
    return this.add(subtree.element, subtree.parentId, subtree.index)
  }

  reparent(
    id: string,
    newParentId: string,
    index?: number
  ): DocumentResult<BaseElement> {
    if (id === this.ROOT_ID) return { ok: false, error: 'root-operation' }
    const element = this.store.get(id)
    if (!element) return { ok: false, error: 'element-not-found' }
    const nextParent = this.store.get(newParentId)
    if (!nextParent) return { ok: false, error: 'parent-not-found' }
    if (id === newParentId || this.hasAncestor(newParentId, id)) {
      return { ok: false, error: 'cycle' }
    }
    const currentParent = element.parent
    if (!currentParent) return { ok: false, error: 'parent-not-found' }
    const currentIndex = currentParent.children.findIndex(
      (child) => child.id === id
    )
    currentParent.children.splice(currentIndex, 1)
    this.attach(element, nextParent, index)
    return { ok: true, value: element }
  }

  exportSnapshot(): EditorDocumentSnapshotV1 {
    return {
      version: 1,
      children: this.root.children.map((element) =>
        element.toJSON()
      ) as EditorDocumentNodeSnapshot[],
    }
  }

  importSnapshot(snapshot: EditorDocumentSnapshotV1): DocumentResult {
    if (snapshot?.version !== 1 || !Array.isArray(snapshot.children)) {
      return { ok: false, error: 'invalid-version' }
    }

    const next = new EditorDocument()
    const append = (
      node: EditorDocumentNodeSnapshot,
      expectedParentId: string
    ): DocumentResult => {
      if (node.parentId !== expectedParentId) {
        return { ok: false, error: 'invalid-parent' }
      }
      const element = this.createElement(node)
      if (!element) return { ok: false, error: 'invalid-type' }
      const added = next.add(element, expectedParentId)
      if (!added.ok) return added
      for (const child of node.children ?? []) {
        const result = append(child, node.id)
        if (!result.ok) return result
      }
      return { ok: true, value: undefined }
    }

    for (const node of snapshot.children) {
      const result = append(node, this.ROOT_ID)
      if (!result.ok) return result
    }

    this.root = next.root
    this.store = next.store
    return { ok: true, value: undefined }
  }

  private attach(
    element: BaseElement,
    parent: BaseElement,
    index?: number
  ): void {
    element.parent = parent
    const insertionIndex = Math.max(
      0,
      Math.min(index ?? parent.children.length, parent.children.length)
    )
    parent.children.splice(insertionIndex, 0, element)
  }

  private registerSubtree(element: BaseElement): void {
    this.store.set(element.id, element)
    element.children.forEach((child) => {
      child.parent = element
      this.registerSubtree(child)
    })
  }

  private unregisterSubtree(element: BaseElement): void {
    this.store.delete(element.id)
    element.children.forEach((child) => this.unregisterSubtree(child))
  }

  private containsSubtreeId(element: BaseElement): boolean {
    if (this.store.has(element.id)) return true
    return element.children.some((child) => this.containsSubtreeId(child))
  }

  private hasAncestor(id: string, ancestorId: string): boolean {
    let current = this.store.get(id)
    while (current?.parent) {
      if (current.parent.id === ancestorId) return true
      current = current.parent
    }
    return false
  }

  private createRoot(): GroupElement {
    return new GroupElement({
      id: this.ROOT_ID,
      name: 'Root',
      width: 0,
      height: 0,
      visible: true,
      locked: true,
    })
  }

  private createElement(node: EditorDocumentNodeSnapshot): BaseElement | null {
    const attrs = {
      id: node.id,
      name: node.name,
      width: node.width,
      height: node.height,
      transform: { ...node.transform },
      visible: node.visible,
      locked: node.locked,
      parentId: node.parentId,
      fill: node.fill,
    }
    if (node.type === ElementType.Group) return new GroupElement(attrs)
    if (node.type === ElementType.Rect) return new RectElement(attrs)
    return null
  }
}
