import type { BaseConfig } from './config'
import { debounce, getUUID } from './utils/common'

interface IEditorOptions {
  containerElement: HTMLDivElement
  width?: number
  height?: number
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
  private _id: string
  private resizeObserver: ResizeObserver

  constructor(options: IEditorOptions) {
    this.containerElement = options.containerElement
    this.canvasElement = document.createElement('canvas')

    this.canvasElement.width = this.containerElement.clientWidth
    this.canvasElement.height = this.containerElement.clientHeight
    this.containerElement.appendChild(this.canvasElement)
    this.ctx = this.canvasElement.getContext('2d')!
    this._id = getUUID()
    console.log('init', this.appVersion)
    console.log('resize----------')
    // 1. 定义回调函数
    const resizeHandler = debounce((entries: ResizeObserverEntry[]) => {
      const entry = entries[0]
      if (!entry) {
        return
      }
      const { width, height } = entry.contentRect
      console.log('resize', 300, width, height)
      if (
        this.canvasElement.width !== width ||
        this.canvasElement.height !== height
      ) {
        this.canvasElement.width = width
        this.canvasElement.height = height
        console.log('resize triggered, canvas resized')
        // 这里调用绘制方法
      }
    }, 100)

    // 2. 实例化 ResizeObserver
    this.resizeObserver = new ResizeObserver(resizeHandler)

    // 3. 开始观察容器元素
    this.resizeObserver.observe(this.containerElement)
  }
  // id，只读
  get id() {
    return this._id
  }
}
