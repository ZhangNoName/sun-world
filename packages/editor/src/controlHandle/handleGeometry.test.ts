import { createHandleGeometry, hitTestHandle } from './handleGeometry'

const box = { minX: 0, minY: 0, maxX: 100, maxY: 80 }

describe('transform handle geometry', () => {
  it('creates eight resize handles and one rotation handle', () => {
    const handles = createHandleGeometry(box, 1)

    expect(handles.map((handle) => handle.name)).toEqual([
      'nw',
      'n',
      'ne',
      'e',
      'se',
      's',
      'sw',
      'w',
      'rotate',
    ])
    expect(handles.find((handle) => handle.name === 'n')?.center).toEqual({
      x: 50,
      y: 0,
    })
    expect(handles.find((handle) => handle.name === 'rotate')?.center).toEqual({
      x: 50,
      y: -24,
    })
  })

  it('keeps handle size and rotation distance constant in screen pixels', () => {
    const zoomedIn = createHandleGeometry(box, 2)
    const zoomedOut = createHandleGeometry(box, 0.5)

    expect(zoomedIn[0].size * 2).toBe(8)
    expect(zoomedOut[0].size * 0.5).toBe(8)
    expect(Math.abs(zoomedIn[8].center.y) * 2).toBe(24)
    expect(Math.abs(zoomedOut[8].center.y) * 0.5).toBe(24)
  })

  it('returns the nearest handle inside tolerance and null outside', () => {
    const handles = createHandleGeometry(box, 1)

    expect(hitTestHandle(handles, { x: 1, y: 1 })?.name).toBe('nw')
    expect(hitTestHandle(handles, { x: 50, y: -23 })?.name).toBe('rotate')
    expect(hitTestHandle(handles, { x: 50, y: 20 })).toBeNull()
  })
})
