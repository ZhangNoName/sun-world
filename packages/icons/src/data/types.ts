export type IconNodeTag =
  | 'path'
  | 'circle'
  | 'rect'
  | 'line'
  | 'polyline'
  | 'polygon'

export type IconNodeAttrs = Record<string, string | number>

export type IconNode = readonly [tag: IconNodeTag, attrs: IconNodeAttrs]

export interface IconDefinition {
  name: string
  viewBox: '0 0 24 24'
  nodes: readonly IconNode[]
}
