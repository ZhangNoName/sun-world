import type { BaseElement } from './baseElement.class'
export class ElementStore {
  private elements: Map<string, BaseElement> = new Map()
  private listeners: Set<(elements: BaseElement[]) => void> = new Set()
  private elementsChangedListeners: Set<(elements: BaseElement[]) => void> =
    new Set()
  private selectedElement: string | null = null
  add(el: BaseElement) {
    this.elements.set(el.id, el)
    this.emit()
    this.emitElementsChanged()
  }

  remove(id: string) {
    this.elements.delete(id)
    this.emit()
    this.emitElementsChanged()
  }

  getAll() {
    return Array.from(this.elements.values())
  }
  getById(id: string) {
    return this.elements.get(id)
  }
  // 元素更新后调用
  update() {
    this.emit()
  }
  addElementsChanged(cb: (elements: BaseElement[]) => void) {
    this.elementsChangedListeners.add(cb)
  }
  removeElementsChanged(cb: (elements: BaseElement[]) => void) {
    this.elementsChangedListeners.delete(cb)
  }
  private emitElementsChanged() {
    this.elementsChangedListeners.forEach((cb) => cb(this.getAll()))
  }
  // renderer 用来监听
  onChange(cb: (elements: BaseElement[]) => void) {
    this.listeners.add(cb)
  }
  hitTest(x: number, y: number) {
    return Object.values(this.elements).find((el) => el.hitTest(x, y))
  }

  private emit() {
    this.listeners.forEach((cb) => cb(this.getAll()))
  }
}
