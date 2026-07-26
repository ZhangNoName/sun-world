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

  it('routes document mutations through undo and redo history', () => {
    const manager = new ElementManager()
    manager.add(rect('one'))
    expect(manager.canUndo).toBe(true)

    expect(manager.undo()).toBe(true)
    expect(manager.getById('one')).toBeUndefined()
    expect(manager.redo()).toBe(true)
    expect(manager.getById('one')).toBeDefined()

    manager.updateElement('one', { name: 'Renamed', width: 240 })
    expect(manager.getById('one')?.name).toBe('Renamed')
    manager.undo()
    expect(manager.getById('one')?.name).toBe('one')

    manager.setSelectedElement('one')
    expect(manager.deleteSelectedElements()).toBe(true)
    expect(manager.getById('one')).toBeUndefined()
    manager.undo()
    expect(manager.getById('one')).toBeDefined()
  })

  it('commits a continuous drag preview as one history entry', () => {
    const manager = new ElementManager()
    manager.add(rect('one'))
    manager.setSelectedElement('one')
    const before = manager.captureSelectedTransforms()

    manager.moveSelectedElement(10, 5)
    manager.moveSelectedElement(15, 20)
    expect(manager.commitSelectedTransforms(before)).toBe(true)
    expect(manager.getById('one')?.getPanelAttrs()).toMatchObject({
      x: 25,
      y: 25,
    })

    manager.undo()
    expect(manager.getById('one')?.getPanelAttrs()).toMatchObject({
      x: 0,
      y: 0,
    })
  })
})
