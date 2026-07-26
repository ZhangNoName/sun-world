import { ElementType, FillType } from '../elements/element.config'
import { GroupElement } from '../elements/group'
import { RectElement } from '../elements/react'
import { EditorDocument } from './editorDocument'

function rect(id: string, name = id) {
  return new RectElement({
    id,
    name,
    width: 100,
    height: 80,
    fill: { type: FillType.Solid, color: '#ff0000' },
  })
}

describe('EditorDocument', () => {
  it('enforces unique ids and existing parents without partial mutation', () => {
    const document = new EditorDocument()
    expect(document.add(rect('one'))).toMatchObject({ ok: true })

    expect(document.add(rect('one'))).toEqual({
      ok: false,
      error: 'duplicate-id',
    })
    expect(document.add(rect('orphan'), 'missing')).toEqual({
      ok: false,
      error: 'parent-not-found',
    })
    expect(document.getAll().map((element) => element.id)).toEqual(['one'])
  })

  it('rejects cycles and preserves world position while reparenting', () => {
    const document = new EditorDocument()
    const group = new GroupElement({
      id: 'group',
      name: 'Group',
      width: 0,
      height: 0,
      x: 40,
      y: 30,
    })
    const child = rect('child')
    expect(document.add(group)).toMatchObject({ ok: true })
    expect(document.add(child, group.id)).toMatchObject({ ok: true })
    const worldBefore = child.worldMatrix

    expect(document.reparent(group.id, child.id)).toEqual({
      ok: false,
      error: 'cycle',
    })
    expect(document.reparent(child.id, document.ROOT_ID, 0)).toMatchObject({
      ok: true,
    })
    expect(child.worldMatrix).toEqual(worldBefore)
    expect(document.rootChildren.map((element) => element.id)).toEqual([
      'child',
      'group',
    ])
  })

  it('removes and restores an exact subtree at its sibling index', () => {
    const document = new EditorDocument()
    const group = new GroupElement({
      id: 'group',
      name: 'Group',
      width: 0,
      height: 0,
    })
    expect(document.add(rect('before'))).toMatchObject({ ok: true })
    expect(document.add(group)).toMatchObject({ ok: true })
    expect(document.add(rect('child'), group.id)).toMatchObject({ ok: true })
    expect(document.add(rect('after'))).toMatchObject({ ok: true })

    const removed = document.remove(group.id)
    expect(removed).toMatchObject({
      ok: true,
      value: { parentId: 'root', index: 1 },
    })
    expect(document.getById('child')).toBeUndefined()
    if (!removed.ok) throw new Error('expected subtree')
    expect(document.restore(removed.value)).toMatchObject({ ok: true })
    expect(document.rootChildren.map((element) => element.id)).toEqual([
      'before',
      'group',
      'after',
    ])
    expect(document.getById('child')?.parentId).toBe('group')
  })

  it('round trips snapshots and rejects invalid imports atomically', () => {
    const document = new EditorDocument()
    expect(document.add(rect('one', 'Original'))).toMatchObject({ ok: true })
    const snapshot = document.exportSnapshot()
    const restored = new EditorDocument()

    expect(restored.importSnapshot(snapshot)).toMatchObject({ ok: true })
    expect(restored.exportSnapshot()).toEqual(snapshot)

    const invalid = {
      version: 1 as const,
      children: [
        {
          id: 'broken',
          name: 'Broken',
          type: ElementType.Rect,
          visible: true,
          locked: false,
          parentId: 'missing',
          width: 10,
          height: 10,
          transform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
          children: [],
        },
      ],
    }
    expect(restored.importSnapshot(invalid)).toEqual({
      ok: false,
      error: 'invalid-parent',
    })
    expect(restored.exportSnapshot()).toEqual(snapshot)
  })
})
