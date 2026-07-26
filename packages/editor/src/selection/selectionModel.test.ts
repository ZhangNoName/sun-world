import { SelectionModel, type SelectableNode } from './selectionModel'

function source(nodes: SelectableNode[]) {
  const store = new Map(nodes.map((node) => [node.id, node]))
  return {
    getSelectableNode: (id: string) => store.get(id),
    getDescendantIds: (id: string) =>
      id === 'group' ? ['group', 'child'] : [id],
  }
}

describe('SelectionModel', () => {
  const nodes: SelectableNode[] = [
    {
      id: 'one',
      visible: true,
      locked: false,
      box: { minX: 10, minY: 20, maxX: 40, maxY: 60 },
    },
    {
      id: 'two',
      visible: true,
      locked: false,
      box: { minX: -5, minY: 30, maxX: 80, maxY: 90 },
    },
    { id: 'locked', visible: true, locked: true, box: null },
    { id: 'hidden', visible: false, locked: false, box: null },
    { id: 'group', visible: true, locked: false, box: null },
    { id: 'child', visible: true, locked: false, box: null },
  ]

  it('replaces, adds, toggles, and clears in deterministic order', () => {
    const selection = new SelectionModel(source(nodes))

    selection.replace(['two', 'one', 'two'])
    selection.add(['locked', 'hidden', 'group'])
    selection.toggle('one')
    selection.toggle('child')

    expect(selection.selectedIds).toEqual(['two', 'group', 'child'])
    selection.clear()
    expect(selection.selectedIds).toEqual([])
  })

  it('removes a selected subtree and emits only on actual changes', () => {
    const selection = new SelectionModel(source(nodes))
    const listener = vi.fn()
    selection.onChange(listener)
    selection.replace(['group', 'child', 'one'])
    selection.removeSubtree('group')
    selection.removeSubtree('missing')

    expect(selection.selectedIds).toEqual(['one'])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('calculates the combined bounds of selected elements', () => {
    const selection = new SelectionModel(source(nodes))
    selection.replace(['one', 'two'])

    expect(selection.bounds).toEqual({
      minX: -5,
      minY: 20,
      maxX: 80,
      maxY: 90,
    })
  })
})
