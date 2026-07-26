import type {
  DetachedSubtree,
  EditorDocument,
} from '../document/editorDocument'
import type { BaseElement, PanelAttrs } from '../elements/baseElement.class'
import type { EleAttrs } from '../elements/ele.type'
import type { EditorCommand } from './command'

export type ElementPatch = Partial<PanelAttrs & EleAttrs>

export class AddElementCommand implements EditorCommand {
  constructor(
    private readonly document: EditorDocument,
    private readonly element: BaseElement,
    private readonly parentId = document.ROOT_ID,
    private readonly index?: number
  ) {}

  execute(): boolean {
    return this.document.add(this.element, this.parentId, this.index).ok
  }

  undo(): void {
    this.document.remove(this.element.id)
  }
}

export class DeleteElementsCommand implements EditorCommand {
  private detached: DetachedSubtree[] = []

  constructor(
    private readonly document: EditorDocument,
    private readonly ids: readonly string[]
  ) {}

  execute(): boolean {
    const topLevelIds = this.filterTopLevelIds()
    if (topLevelIds.length === 0) return false
    const removed: DetachedSubtree[] = []
    for (const id of topLevelIds) {
      const result = this.document.remove(id)
      if (!result.ok) {
        removed
          .slice()
          .sort((a, b) => a.index - b.index)
          .forEach((subtree) => this.document.restore(subtree))
        return false
      }
      removed.push(result.value)
    }
    this.detached = removed
    return true
  }

  undo(): void {
    this.detached
      .slice()
      .sort((a, b) => a.index - b.index)
      .forEach((subtree) => this.document.restore(subtree))
  }

  private filterTopLevelIds(): string[] {
    const requested = new Set(this.ids)
    return [...new Set(this.ids)].filter((id) => {
      let parent = this.document.getById(id)?.parent
      while (parent && parent.id !== this.document.ROOT_ID) {
        if (requested.has(parent.id)) return false
        parent = parent.parent
      }
      return Boolean(this.document.getById(id))
    })
  }
}

export class UpdateElementCommand implements EditorCommand {
  private before: ElementPatch | null = null

  constructor(
    private readonly document: EditorDocument,
    private readonly id: string,
    private readonly patch: ElementPatch
  ) {}

  execute(): boolean {
    const element = this.document.getById(this.id)
    if (!element) return false
    this.before ??= capturePatch(element)
    element.updateAttrs(this.patch)
    return true
  }

  undo(): void {
    const element = this.document.getById(this.id)
    if (element && this.before) element.updateAttrs(this.before)
  }
}

export interface ElementTransform {
  id: string
  patch: ElementPatch
}

export class TransformElementsCommand implements EditorCommand {
  private before: ElementTransform[] | null = null

  constructor(
    private readonly document: EditorDocument,
    private readonly transforms: readonly ElementTransform[]
  ) {}

  execute(): boolean {
    const elements = this.transforms.map(({ id }) => this.document.getById(id))
    if (elements.some((element) => !element)) return false
    this.before ??= elements.map((element, index) => ({
      id: this.transforms[index].id,
      patch: capturePatch(element!),
    }))
    elements.forEach((element, index) =>
      element!.updateAttrs(this.transforms[index].patch)
    )
    return true
  }

  undo(): void {
    this.before?.forEach(({ id, patch }) =>
      this.document.getById(id)?.updateAttrs(patch)
    )
  }
}

export class ReparentElementCommand implements EditorCommand {
  private previousParentId: string | null = null
  private previousIndex = -1

  constructor(
    private readonly document: EditorDocument,
    private readonly id: string,
    private readonly parentId: string,
    private readonly index?: number
  ) {}

  execute(): boolean {
    const element = this.document.getById(this.id)
    if (!element) return false
    if (this.previousParentId === null) {
      this.previousParentId = element.parentId
      this.previousIndex = this.document.getSiblingIndex(this.id)
    }
    return this.document.reparent(this.id, this.parentId, this.index).ok
  }

  undo(): void {
    if (this.previousParentId === null) return
    this.document.reparent(this.id, this.previousParentId, this.previousIndex)
  }
}

function capturePatch(element: BaseElement): ElementPatch {
  const serialized = element.toJSON() as EleAttrs
  return {
    ...element.getPanelAttrs(),
    name: element.name,
    visible: element.visible,
    locked: element.locked,
    fill: serialized.fill,
  }
}
