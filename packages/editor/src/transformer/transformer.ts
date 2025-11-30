import { Point } from '@/types/common.type'

export class Transformer {
  scale = 1
  x = 0
  y = 0

  setTransform({ scale, x, y }) {
    this.scale = scale
    this.x = x
    this.y = y
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
