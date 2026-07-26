import { EditorDocument } from '../document/editorDocument'
import { FillType } from '../elements/element.config'
import { GroupElement } from '../elements/group'
import { RectElement } from '../elements/react'
import { CommandManager } from './commandManager'
import {
  AddElementCommand,
  DeleteElementsCommand,
  ReparentElementCommand,
  TransformElementsCommand,
  UpdateElementCommand,
} from './documentCommands'

function rect(id: string, x = 0) {
  return new RectElement({
    id,
    name: id,
    x,
    y: 10,
    width: 100,
    height: 80,
    fill: { type: FillType.Solid, color: '#ff0000' },
  })
}

describe('document commands', () => {
  it('adds and removes the same element through undo and redo', () => {
    const document = new EditorDocument()
    const history = new CommandManager()
    const element = rect('one')

    expect(history.execute(new AddElementCommand(document, element))).toBe(true)
    history.undo()
    expect(document.getById('one')).toBeUndefined()
    history.redo()
    expect(document.getById('one')).toBe(element)
  })

  it('deletes and restores complete subtrees at exact sibling positions', () => {
    const document = new EditorDocument()
    const history = new CommandManager()
    const group = new GroupElement({
      id: 'group',
      name: 'group',
      width: 0,
      height: 0,
    })
    document.add(rect('before'))
    document.add(group)
    document.add(rect('child'), 'group')
    document.add(rect('after'))

    expect(
      history.execute(new DeleteElementsCommand(document, ['group']))
    ).toBe(true)
    expect(document.getById('child')).toBeUndefined()
    history.undo()
    expect(document.rootChildren.map((element) => element.id)).toEqual([
      'before',
      'group',
      'after',
    ])
    expect(document.getById('child')?.parentId).toBe('group')
  })

  it('restores properties and multi-element transforms exactly', () => {
    const document = new EditorDocument()
    const history = new CommandManager()
    const one = rect('one', 5)
    const two = rect('two', 15)
    document.add(one)
    document.add(two)

    history.execute(
      new UpdateElementCommand(document, 'one', {
        name: 'Renamed',
        width: 240,
        locked: true,
      })
    )
    expect(one.toJSON()).toMatchObject({
      name: 'Renamed',
      width: 240,
      locked: true,
    })
    history.undo()
    expect(one.toJSON()).toMatchObject({
      name: 'one',
      width: 100,
      locked: false,
    })

    history.execute(
      new TransformElementsCommand(document, [
        { id: 'one', patch: { x: 55, y: 60, rotation: Math.PI / 4 } },
        { id: 'two', patch: { x: 75, y: 80, width: 120 } },
      ])
    )
    expect(one.getPanelAttrs()).toMatchObject({
      x: 55,
      y: 60,
      rotation: Math.PI / 4,
    })
    history.undo()
    expect(one.getPanelAttrs()).toMatchObject({ x: 5, y: 10, rotation: 0 })
    expect(two.getPanelAttrs()).toMatchObject({ x: 15, y: 10, width: 100 })
  })

  it('reparents and restores the original parent and sibling index', () => {
    const document = new EditorDocument()
    const history = new CommandManager()
    const group = new GroupElement({
      id: 'group',
      name: 'group',
      width: 0,
      height: 0,
    })
    document.add(rect('before'))
    document.add(rect('moving'))
    document.add(rect('after'))
    document.add(group)

    history.execute(new ReparentElementCommand(document, 'moving', 'group'))
    expect(document.getById('moving')?.parentId).toBe('group')
    history.undo()
    expect(document.rootChildren.map((element) => element.id)).toEqual([
      'before',
      'moving',
      'after',
      'group',
    ])
  })
})
