export abstract class BaseElement {
  id: string
  x: number
  y: number
  width: number
  height: number
  rotation: number = 0
  isSelected: boolean = false

  constructor(params: { x: number; y: number; width: number; height: number }) {
    this.id = crypto.randomUUID()
    this.x = params.x
    this.y = params.y
    this.width = params.width
    this.height = params.height
  }

  abstract draw(ctx: CanvasRenderingContext2D): void
  abstract hitTest(px: number, py: number): boolean

  move(dx: number, dy: number) {
    this.x += dx
    this.y += dy
  }

  resize(newWidth: number, newHeight: number) {
    this.width = newWidth
    this.height = newHeight
  }

  getBoundingBox() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
    }
  }
}
