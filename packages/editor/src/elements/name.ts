import { ElementType } from "./element.config";

export class EleName {
  private eleCount: Map<ElementType, string[]> = new Map()
  public getName(type: ElementType): string {
    if (!this.eleCount.has(type)) {
      this.eleCount.set(type, [])
    }
    const q = this.eleCount.get(type) ?? []
    const nextId = Number(q[q.length - 1]?.split(' ')?.at(-1) ?? 0)
    const newName = `${type} ${nextId + 1}`
    q.push(newName)
    console.log('生成新元素名称：', newName)
    return newName
  }
}