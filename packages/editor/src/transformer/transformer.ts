import { Point } from "../types/common.type"

export class Transformer {
  scale = 1
  x = 0
  y = 0

  setTransform(params: { scale?: number; x?: number; y?: number }): void {
    this.scale = params.scale ?? this.scale
    this.x = params.x ?? this.x
    this.y = params.y ?? this.y
  }

  toCanvas(e: MouseEvent) {
    return {
      x: (e.offsetX - this.x) / this.scale,
      y: (e.offsetY - this.y) / this.scale,
    }
  }

  toScreen(point: Point) {
    return {
      x: point.x * this.scale + this.x,
      y: point.y * this.scale + this.y,
    }
  }
}

export const transformer = new Transformer()
