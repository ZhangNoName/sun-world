declare module '@sun-world/editor' {
  export enum ElementType {
    Rect = 'rect',
    Text = 'text',
    Line = 'line',
    Arrow = 'arrow',
    Ellipse = 'ellipse',
    Polygon = 'polygon',
    Star = 'star',
    Diamond = 'diamond',
    Triangle = 'triangle',
    Rectangle = 'rectangle',
    Circle = 'circle',
    Group = 'group',
    Frame = 'frame',
  }

  export type ToolName =
    | 'rect'
    | 'select'
    | 'line'
    | 'text'
    | 'image'
    | 'eraser'
    | 'drag'
    | 'comment'
    | 'area'
    | 'resize'
    | 'rotate'

  export interface NodeInfo {
    id: string
    name: string
    type: ElementType
    visible: boolean
    locked: boolean
    parentId: string | null
    children: NodeInfo[]
  }

  export class BaseElement {
    get id(): string
    get name(): string
    get children(): BaseElement[]
    get visible(): boolean
    get parentId(): string

    getNodeInfo(): NodeInfo
  }

  export class SWEditor {
    constructor(options: {
      containerElement: HTMLDivElement
      width?: number
      height?: number
      offsetX?: number
      offsetY?: number
      showPerfMonitor?: boolean
    })

    setTool(name: ToolName): void
    getActiveToolName(): ToolName | null
    get zoom(): number
    onZoomChange(cb: (zoom: number) => void): void
    toolChanged(cb: () => void): void
    elementManagerChanged(cb: (elements: BaseElement[]) => void): void
    elementTreeChanged(cb: (elements: NodeInfo[]) => void): void
  }
}
