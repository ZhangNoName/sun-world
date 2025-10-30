import { CanvasEditor } from '@/types/editor.type'

export class CanvasEngine implements CanvasEditor {
  ctx!: CanvasRenderingContext2D
  canvas!: HTMLCanvasElement

  init(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  render() {
    /* 手动绘制内容 */
  }
  addObject(obj: any) {}
  destroy() {}
  removeObject(id: string) {}
  selectById(id: string) {}
  toJSON() {
    return {}
  }
  fromJSON() {}
  save() {}
  load() {}
  clear() {}
  export() {}
  import() {}
}
