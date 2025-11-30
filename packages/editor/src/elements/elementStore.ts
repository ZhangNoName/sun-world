import type { BaseElement } from '../types/element.type'
export class ElementStore {
  private elements: BaseElement[] = []
  private listeners: Set<() => void> = new Set()

  add(el: BaseElement) {
    this.elements.push(el)
    this.emit()
  }

  remove(id: string) {
    this.elements = this.elements.filter((e) => e.id !== id)
    this.emit()
  }

  getAll() {
    return this.elements
  }

  // 元素更新后调用
  update() {
    this.emit()
  }

  // renderer 用来监听
  onChange(cb: () => void) {
    this.listeners.add(cb)
  }

  private emit() {
    this.listeners.forEach((cb) => cb())
  }
}
