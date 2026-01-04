import type { BaseElement } from './baseElement.class'
export class ElementStore {
  private elements: Map<string, BaseElement> = new Map()
  private listeners: Set<() => void> = new Set()
  private selectedElement: string | null = null
  add(el: BaseElement) {
    this.elements.set(el.id, el)
    this.emit()
  }

  remove(id: string) {
    this.elements.delete(id)
    this.emit()
  }

  getAll() {
    return this.elements.values()
  }
  getById(id: string) {
    return this.elements.get(id)
  }
  // 元素更新后调用
  update() {
    this.emit()
  }

  // renderer 用来监听
  onChange(cb: () => void) {
    this.listeners.add(cb)
  }
  hitTest(x: number, y: number) {
    return Object.values(this.elements).find((el) => el.hitTest(x, y))
  }

  private emit() {
    this.listeners.forEach((cb) => cb())
  }
}
