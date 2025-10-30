// src/editor/engines/pixiEngine.ts
import * as PIXI from 'pixi.js'
import type { IEngine } from '../core/IEngine'

export class PixiEngine implements IEngine {
  app!: PIXI.Application

  init(canvas: HTMLCanvasElement) {
    this.app = new PIXI.Application({
      view: canvas,
      backgroundColor: 0xffffff,
      resizeTo: window,
    })
  }

  render() {
    this.app.render()
  }
  addObject(obj: PIXI.DisplayObject) {
    this.app.stage.addChild(obj)
  }
  destroy() {
    this.app.destroy(true)
  }
  removeObject(id: string) {}
  selectById(id: string) {}
  toJSON() {
    return {}
  }
  fromJSON() {}
}
