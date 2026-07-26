import type { IBox } from '../types/common.type'

export interface SelectableNode {
  id: string
  visible: boolean
  locked: boolean
  box: IBox | null
}

export interface SelectionSource {
  getSelectableNode(id: string): SelectableNode | undefined
  getDescendantIds(id: string): string[]
}

type SelectionListener = (selectedIds: readonly string[]) => void

export class SelectionModel {
  private ids: string[] = []
  private readonly listeners = new Set<SelectionListener>()

  constructor(private readonly source: SelectionSource) {}

  get selectedIds(): readonly string[] {
    return this.ids
  }

  get bounds(): IBox | null {
    let result: IBox | null = null
    for (const id of this.ids) {
      const box = this.source.getSelectableNode(id)?.box
      if (!box) continue
      result = result
        ? {
            minX: Math.min(result.minX, box.minX),
            minY: Math.min(result.minY, box.minY),
            maxX: Math.max(result.maxX, box.maxX),
            maxY: Math.max(result.maxY, box.maxY),
          }
        : { ...box }
    }
    return result
  }

  replace(ids: Iterable<string>): void {
    this.commit(this.filterSelectable(ids))
  }

  add(ids: Iterable<string>): void {
    const next = [...this.ids]
    for (const id of this.filterSelectable(ids)) {
      if (!next.includes(id)) next.push(id)
    }
    this.commit(next)
  }

  toggle(id: string): void {
    if (this.ids.includes(id)) {
      this.commit(this.ids.filter((selectedId) => selectedId !== id))
      return
    }
    this.add([id])
  }

  clear(): void {
    this.commit([])
  }

  removeSubtree(id: string): void {
    const removed = new Set(this.source.getDescendantIds(id))
    this.commit(this.ids.filter((selectedId) => !removed.has(selectedId)))
  }

  onChange(listener: SelectionListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private filterSelectable(ids: Iterable<string>): string[] {
    const result: string[] = []
    for (const id of ids) {
      const node = this.source.getSelectableNode(id)
      if (!node || !node.visible || node.locked || result.includes(id)) continue
      result.push(id)
    }
    return result
  }

  private commit(next: string[]): void {
    if (
      next.length === this.ids.length &&
      next.every((id, index) => id === this.ids[index])
    ) {
      return
    }
    this.ids = next
    this.listeners.forEach((listener) => listener(this.ids))
  }
}
