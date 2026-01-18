
import type { BaseElement } from './baseElement.class'
import { RectElement } from './react'
import { ElementType } from './element.config'
export interface EleTreeNode{
  id:string ,
  name:string,
  type:ElementType,
  visible:boolean,
  locked:boolean,
  children:EleTreeNode[] | undefined,
}
export class ElementStore {
  private elements: Map<string, BaseElement> = new Map()
  private listeners: Set<(elements: BaseElement[]) => void> = new Set()
  private elementsChangedListeners: Set<(elements: BaseElement[]) => void> =
    new Set()
  private selectedElement: string | null = null
  constructor() {
    this.loadLocal()
  }
  add(el: BaseElement) {
    this.elements.set(el.id, el)
    this.emit()
    this.saveLocal()
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
  getRootElements() {
    return this.getAll().filter((el) => !el.parentId)
  }
  getById(id: string) {
    return this.elements.get(id)
  }
  // 元素更新后调用
  update() {
    this.emit()
  }
  addElementsChanged(cb: (elements: BaseElement[]) => void) {
    cb(this.getAll())
    this.elementsChangedListeners.add(cb)
  }
  removeElementsChanged(cb: (elements: BaseElement[]) => void) {
    this.elementsChangedListeners.delete(cb)
  }
  private emitElementsChanged() {
    this.elementsChangedListeners.forEach((cb) => cb(this.getAll()))
  }

  saveLocal() {
    localStorage.setItem('elements', JSON.stringify(this.getAll()))
  }
  loadLocal() {
    const elements = JSON.parse(localStorage.getItem('elements') || '[]')
    for (const el of elements) {
      this.add(new RectElement(el))
    }
    this.emitElementsChanged()
    // this.emit()
  }
  // renderer 用来监听
  onChange(cb: (elements: BaseElement[]) => void) {
    this.listeners.add(cb)
  }
  hitTest(x: number, y: number) {
    return this.getRootElements().find((el) => el.hitTest(x, y))
  }

  private emit() {
    this.listeners.forEach((cb) => cb(this.getAll()))
  }
}
