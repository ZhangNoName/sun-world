import { EditorDocument } from '../document/editorDocument'
import { CompositeCommand, type HistoryState } from '../history/command'
import { CommandManager } from '../history/commandManager'
import {
  AddElementCommand,
  DeleteElementsCommand,
  ReparentElementCommand,
  UpdateElementCommand,
  type ElementPatch,
  type ElementTransform,
  TransformElementsCommand,
} from '../history/documentCommands'
import { SelectionModel } from '../selection/selectionModel'
import type { IBox, IPoint } from '../types/common.type'
import { intersectBox, isPointInBox } from '../utils/common'
import type { BaseElement } from './baseElement.class'
import type { ElementType } from './element.config'
import type { NodeInfo } from './ele.type'
import { EleName } from './name'

type PersistedV1 = {
  version: 1
  updatedAt: number
  data: ReturnType<BaseElement['toJSON']>[]
}

export class ElementManager {
  private readonly eleName = new EleName()
  private readonly storageKey = 'editor-data'
  private readonly document = new EditorDocument()
  private readonly history = new CommandManager()
  private readonly selection = new SelectionModel({
    getSelectableNode: (id) => this.document.getById(id),
    getDescendantIds: (id) => this.document.getDescendantIds(id),
  })
  private marqueeRect: IBox | null = null
  private selectionBoxVisible = true
  private readonly hierarchyChangedListeners = new Set<
    (rootChildren: NodeInfo[]) => void
  >()
  private readonly elementsChangedListeners = new Set<
    (elements: BaseElement[]) => void
  >()
  private isHydrating = false

  public readonly ROOT_ID = this.document.ROOT_ID

  constructor() {
    this.loadLocal()
  }

  generateName(type: ElementType): string {
    return this.eleName.getName(type)
  }

  add(element: BaseElement, parentId = this.ROOT_ID, index?: number): void {
    const changed = this.history.execute(
      new AddElementCommand(
        this.document,
        element,
        this.normalizeParentId(parentId),
        index
      )
    )
    if (changed && !this.isHydrating) this.emitHierarchyChanged()
  }

  remove(id: string): void {
    this.selection.removeSubtree(id)
    const changed = this.history.execute(
      new DeleteElementsCommand(this.document, [id])
    )
    if (changed && !this.isHydrating) this.emitHierarchyChanged()
  }

  getAll(): BaseElement[] {
    return this.document.getAll()
  }

  getRootElements(): readonly BaseElement[] {
    return this.document.rootChildren
  }

  getById(id: string): BaseElement | undefined {
    return this.document.getById(id)
  }

  moveNode(id: string, newParentId?: string | null, index?: number): void {
    const changed = this.history.execute(
      new ReparentElementCommand(
        this.document,
        id,
        this.normalizeParentId(newParentId),
        index
      )
    )
    if (changed) this.emitHierarchyChanged()
  }

  moveNodes(ids: string[], newParentId: string, index?: number): void {
    const selected = new Set(ids)
    const topLevelIds = ids.filter((id) => {
      let parent = this.document.getById(id)?.parent
      while (parent && parent.id !== this.ROOT_ID) {
        if (selected.has(parent.id)) return false
        parent = parent.parent
      }
      return true
    })
    const targetParentId = this.normalizeParentId(newParentId)
    const commands = topLevelIds.map(
      (id, offset) =>
        new ReparentElementCommand(
          this.document,
          id,
          targetParentId,
          index === undefined ? undefined : index + offset
        )
    )
    const changed = this.history.execute(new CompositeCommand(commands))
    if (changed) this.emitHierarchyChanged()
  }

  updateElement(id: string, patch: ElementPatch): boolean {
    const changed = this.history.execute(
      new UpdateElementCommand(this.document, id, patch)
    )
    if (changed) this.emitElementsChanged()
    return changed
  }

  deleteSelectedElements(): boolean {
    const ids = [...this.selection.selectedIds]
    if (ids.length === 0) return false
    const changed = this.history.execute(
      new DeleteElementsCommand(this.document, ids)
    )
    if (!changed) return false
    ids.forEach((id) => this.selection.removeSubtree(id))
    this.emitHierarchyChanged()
    return true
  }

  get canUndo(): boolean {
    return this.history.canUndo
  }

  get canRedo(): boolean {
    return this.history.canRedo
  }

  undo(): boolean {
    const changed = this.history.undo()
    if (changed) this.emitHierarchyChanged()
    return changed
  }

  redo(): boolean {
    const changed = this.history.redo()
    if (changed) this.emitHierarchyChanged()
    return changed
  }

  onHistoryChange(callback: (state: HistoryState) => void): () => void {
    callback({ canUndo: this.canUndo, canRedo: this.canRedo })
    return this.history.onChange(callback)
  }

  destroy(): void {
    this.history.dispose()
    this.hierarchyChangedListeners.clear()
    this.elementsChangedListeners.clear()
  }

  update(): void {
    if (!this.isHydrating) this.emitElementsChanged()
  }

  onElementsChange(callback: (elements: BaseElement[]) => void): () => void {
    callback(this.getAll())
    this.elementsChangedListeners.add(callback)
    return () => this.elementsChangedListeners.delete(callback)
  }

  onHierarchyChange(callback: (rootChildren: NodeInfo[]) => void): () => void {
    callback(this.tree)
    this.hierarchyChangedListeners.add(callback)
    return () => this.hierarchyChangedListeners.delete(callback)
  }

  saveLocal(): void {
    const snapshot = this.document.exportSnapshot()
    const data: PersistedV1 = {
      version: 1,
      updatedAt: Date.now(),
      data: snapshot.children,
    }
    localStorage.setItem(this.storageKey, JSON.stringify(data))
  }

  loadLocal(): void {
    const raw = localStorage.getItem(this.storageKey)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as PersistedV1
      if (parsed?.version !== 1 || !Array.isArray(parsed.data)) return
      this.isHydrating = true
      const result = this.document.importSnapshot({
        version: 1,
        children: parsed.data,
      })
      if (result.ok) this.selection.clear()
    } catch {
      // Invalid legacy data must not prevent editor startup.
    } finally {
      this.isHydrating = false
    }
    this.emitHierarchyChanged()
  }

  getMarqueeRect(): IBox | null {
    return this.marqueeRect
  }

  setMarqueeRect(rect: IBox): void {
    this.marqueeRect = rect
    this.selectByMarquee()
  }

  clearMarqueeRect(): void {
    this.marqueeRect = null
  }

  getSelectedBox(): IBox | null {
    return this.selectionBoxVisible ? this.selection.bounds : null
  }

  clearSelectedBox(): void {
    this.selectionBoxVisible = false
  }

  calcSelectBox(): IBox | null {
    this.selectionBoxVisible = true
    return this.selection.bounds
  }

  hitSelectBox(point: IPoint): boolean {
    const box = this.getSelectedBox()
    return box ? isPointInBox(box, point) : false
  }

  hitTest(): boolean {
    this.selectByMarquee()
    return this.selection.selectedIds.length > 0
  }

  selectByMarquee(
    _x1?: number,
    _y1?: number,
    _x2?: number,
    _y2?: number
  ): boolean {
    if (!this.marqueeRect) {
      this.selection.clear()
      return false
    }
    const selected: string[] = []
    const visit = (elements: readonly BaseElement[]) => {
      for (const element of elements) {
        if (!element.visible || element.locked) continue
        const box = element.box
        if (box && intersectBox(this.marqueeRect!, box))
          selected.push(element.id)
        visit(element.children)
      }
    }
    visit(this.document.rootChildren)
    this.selection.replace(selected)
    this.selectionBoxVisible = true
    return selected.length > 0
  }

  hitTopExcludeSelected(x: number, y: number): string | null {
    if (this.selection.selectedIds.length === 0) return null
    const selected = new Set(this.selection.selectedIds)
    let targetId: string | null = this.ROOT_ID

    const visit = (element: BaseElement): void => {
      if (selected.has(element.id) || !element.visible || element.locked) return
      const box = element.box
      if (!box || !isPointInBox(box, { x, y })) return
      targetId = element.id
      element.children.forEach(visit)
    }
    this.document.rootChildren.forEach(visit)

    const currentParentId = this.selectedElements[0]?.parentId ?? this.ROOT_ID
    if (!targetId || targetId === currentParentId) return null
    this.moveNodes([...this.selection.selectedIds], targetId)
    return targetId
  }

  get selectedIds(): readonly string[] {
    return this.selection.selectedIds
  }

  get selectedElements(): BaseElement[] {
    return this.selection.selectedIds
      .map((id) => this.document.getById(id))
      .filter((element): element is BaseElement => Boolean(element))
  }

  setSelectedElement(id: string): void {
    this.selection.add([id])
    this.selectionBoxVisible = true
  }

  clearSelectedElement(): void {
    this.selection.clear()
    this.selectionBoxVisible = true
  }

  replaceSelection(ids: Iterable<string>): void {
    this.selection.replace(ids)
    this.selectionBoxVisible = true
  }

  addSelection(ids: Iterable<string>): void {
    this.selection.add(ids)
    this.selectionBoxVisible = true
  }

  toggleSelection(ids: Iterable<string>): void {
    for (const id of ids) this.selection.toggle(id)
    this.selectionBoxVisible = true
  }

  moveSelectedElement(dx: number, dy: number): void {
    this.selectedElements.forEach((element) => element.move(dx, dy))
  }

  captureSelectedTransforms(): ElementTransform[] {
    return this.selectedElements.map((element) => ({
      id: element.id,
      patch: { ...element.getPanelAttrs() },
    }))
  }

  commitSelectedTransforms(before: readonly ElementTransform[]): boolean {
    const after = before
      .map(({ id }) => this.document.getById(id))
      .filter((element): element is BaseElement => Boolean(element))
      .map((element) => ({
        id: element.id,
        patch: { ...element.getPanelAttrs() },
      }))
    if (JSON.stringify(before) === JSON.stringify(after)) return false

    before.forEach(({ id, patch }) =>
      this.document.getById(id)?.updateAttrs(patch)
    )
    const changed = this.history.execute(
      new TransformElementsCommand(this.document, after)
    )
    if (changed) this.emitElementsChanged()
    return changed
  }

  applyTransformPreview(transforms: readonly ElementTransform[]): void {
    transforms.forEach(({ id, patch }) =>
      this.document.getById(id)?.updateAttrs(patch)
    )
    this.emitElementsChanged()
  }

  restoreTransformPreview(transforms: readonly ElementTransform[]): void {
    this.applyTransformPreview(transforms)
    this.calcSelectBox()
  }

  renderAll(context: CanvasRenderingContext2D): void {
    this.document.rootChildren.forEach((element) => element.render(context))
  }

  get tree(): NodeInfo[] {
    return this.document.rootChildren.map((element) => element.getNodeInfo())
  }

  private normalizeParentId(parentId?: string | null): string {
    return parentId || this.ROOT_ID
  }

  private emitElementsChanged(): void {
    const elements = this.getAll()
    this.elementsChangedListeners.forEach((callback) => callback(elements))
  }

  private emitHierarchyChanged(): void {
    const tree = this.tree
    this.hierarchyChangedListeners.forEach((callback) => callback(tree))
    this.emitElementsChanged()
  }
}
