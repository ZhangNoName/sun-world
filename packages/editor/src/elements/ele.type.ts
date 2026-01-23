import { Matrix, Optional } from "@/types/common.type"
import { ElementType, FillStyle } from "./element.config"

export interface EleAttrs {
  id: string
  name: string
  type: ElementType
  width: number
  height: number
  transform: Matrix,


  // 可选属性
  opacity?: number,
  fill?: FillStyle
  parentId?: string
  visible?: boolean
  locked?: boolean
}
export type EleCreateAttrs = Optional<EleAttrs, 'transform' | 'id'> & {
  x?: number,
  y?: number,
  rotation?: number,
}
export interface PanelAttrs extends EleAttrs {
  x: number
  y: number
  rotation: number
}
export type NodeInfo = {
  id: string
  name: string
  type: ElementType
  visible: boolean
  locked: boolean
  parentId: string | null
  children: NodeInfo[]
}
