import type { BaseConfig } from './config'

interface IEditorOptions {
  containerElement: HTMLDivElement
  width: number
  height: number
  offsetX?: number
  offsetY?: number
  showPerfMonitor?: boolean
  userPreference?: Partial<BaseConfig>
}

interface Events {
  destroy(): void
}

export class SWEditor {
  containerElement: HTMLDivElement
  canvasElement: HTMLCanvasElement
  ctx: CanvasRenderingContext2D

  appVersion = 'sw-editor_0.0.0'
  paperId: string

  constructor(options: IEditorOptions) {
    this.containerElement = options.containerElement
    this.canvasElement = document.createElement('canvas')
    this.containerElement.appendChild(this.canvasElement)
    this.ctx = this.canvasElement.getContext('2d')!
    this.paperId = '123'
  }
}
