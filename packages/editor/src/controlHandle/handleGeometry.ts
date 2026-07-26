import type { IBox, IPoint } from '../types/common.type'

export type ResizeHandleName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type TransformHandleName = ResizeHandleName | 'rotate'

interface HandleGeometryBase {
  center: IPoint
  size: number
}

export type TransformHandleGeometry =
  | (HandleGeometryBase & { name: ResizeHandleName; kind: 'resize' })
  | (HandleGeometryBase & { name: 'rotate'; kind: 'rotate' })

const HANDLE_SIZE_PX = 8
const ROTATION_DISTANCE_PX = 24

export function createHandleGeometry(
  box: IBox,
  scale: number
): TransformHandleGeometry[] {
  const safeScale = Math.max(Math.abs(scale), 0.0001)
  const size = HANDLE_SIZE_PX / safeScale
  const rotationDistance = ROTATION_DISTANCE_PX / safeScale
  const centerX = (box.minX + box.maxX) / 2
  const centerY = (box.minY + box.maxY) / 2
  const resize: Array<[ResizeHandleName, IPoint]> = [
    ['nw', { x: box.minX, y: box.minY }],
    ['n', { x: centerX, y: box.minY }],
    ['ne', { x: box.maxX, y: box.minY }],
    ['e', { x: box.maxX, y: centerY }],
    ['se', { x: box.maxX, y: box.maxY }],
    ['s', { x: centerX, y: box.maxY }],
    ['sw', { x: box.minX, y: box.maxY }],
    ['w', { x: box.minX, y: centerY }],
  ]
  return [
    ...resize.map(([name, center]) => ({
      name,
      kind: 'resize' as const,
      center,
      size,
    })),
    {
      name: 'rotate',
      kind: 'rotate',
      center: { x: centerX, y: box.minY - rotationDistance },
      size,
    },
  ]
}

export function hitTestHandle(
  handles: readonly TransformHandleGeometry[],
  point: IPoint,
  tolerance = 2
): TransformHandleGeometry | null {
  let nearest: TransformHandleGeometry | null = null
  let nearestDistance = Infinity
  for (const handle of handles) {
    const distance = Math.hypot(
      point.x - handle.center.x,
      point.y - handle.center.y
    )
    if (distance > handle.size / 2 + tolerance || distance >= nearestDistance) {
      continue
    }
    nearest = handle
    nearestDistance = distance
  }
  return nearest
}
