import { FillType } from './element.config'
import { ElementManager } from './elementManager'
import { GroupElement } from './group'
import { RectElement } from './react'

function rect(id: string, locked = false) {
  return new RectElement({
    id,
    name: id,
    width: 100,
    height: 80,
    locked,
    fill: { type: FillType.Solid, color: '#ff0000' },
  })
}

function group(id: string) {
  return new GroupElement({ id, name: id, width: 0, height: 0 })
}

describe('ElementManager model delegation', () => {
  beforeEach(() => localStorage.clear())

  it('removes selection for an entire deleted subtree', () => {
    const manager = new ElementManager()
    manager.add(group('group'))
    manager.add(rect('child'), 'group')
    manager.setSelectedElement('child')

    manager.remove('group')

    expect(manager.selectedIds).toEqual([])
    expect(manager.getById('child')).toBeUndefined()
  })

  it('excludes locked elements from canvas selection', () => {
    const manager = new ElementManager()
    manager.add(rect('locked', true))

    manager.setSelectedElement('locked')

    expect(manager.selectedIds).toEqual([])
  })

  it('rejects reparenting a node into its own descendant', () => {
    const manager = new ElementManager()
    manager.add(group('group'))
    manager.add(group('child'), 'group')

    manager.moveNode('group', 'child')

    expect(manager.getById('group')?.parentId).toBe('root')
    expect(manager.getById('child')?.parentId).toBe('group')
    expect(manager.tree[0]?.id).toBe('group')
  })
})
