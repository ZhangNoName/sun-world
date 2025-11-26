import type { BaseElement } from '../types/element.type'

export class ElementStore {
  private elements: BaseElement[] = []

  add(el: BaseElement) {
    this.elements.push(el)
  }

  remove(id: string) {
    this.elements = this.elements.filter((e) => e.id !== id)
  }

  getAll() {
    return this.elements
  }

  getById(id: string) {
    return this.elements.find((e) => e.id === id)
  }
}
