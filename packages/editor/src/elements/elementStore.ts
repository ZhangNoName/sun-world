import type { BaseElement } from './baseElement.class'
export class ElementStore {
  private elements: Record<string, BaseElement> = {}
  private listeners: Set<() => void> = new Set()
  private selectedElement: string | null = null
  add(el: BaseElement) {
    this.elements[el.id] = el
    this.emit()
  }

  remove(id: string) {
    delete this.elements[id]
    this.emit()
  }

  getAll() {
    return this.elements
  }
  getById(id: string) {
    return this.elements[id]
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
