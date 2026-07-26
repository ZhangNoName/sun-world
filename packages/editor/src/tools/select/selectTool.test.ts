import { CursorManager } from '../../cursor/cursorManager'
import { FillType } from '../../elements/element.config'
import { ElementManager } from '../../elements/elementManager'
import { RectElement } from '../../elements/react'
import { InputController } from '../../event/inputController'
import type { ToolContext } from '../../types/tools.type'
import ViewportState from '../../viewport/viewport'
import SelectTool from './index'

function rect(id: string, x: number) {
  return new RectElement({
    id,
    name: id,
    x,
    y: 0,
    width: 100,
    height: 80,
    fill: { type: FillType.Solid, color: '#ff0000' },
  })
}

function mouse(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { button: 0 })
  Object.defineProperties(event, {
    offsetX: { value: x },
    offsetY: { value: y },
  })
  return event
}

function setup() {
  localStorage.clear()
  const canvas = document.createElement('canvas')
  const input = new InputController({ canvas, keyboardTarget: window })
  const elements = new ElementManager()
  const viewport = new ViewportState()
  const render = vi.fn()
  const context: ToolContext = {
    input,
    elements,
    viewport,
    cursor: new CursorManager(canvas),
    render,
  }
  return { input, elements, tool: new SelectTool(context), render }
}

describe('SelectTool interactions', () => {
  it('adds a clicked element to selection while Shift is held', () => {
    const { input, elements, tool } = setup()
    elements.add(rect('one', 0))
    elements.add(rect('two', 200))
    elements.setSelectedElement('one')
    elements.calcSelectBox()
    input.state.shift = true

    tool.onMouseDown(mouse('pointerdown', 210, 10))
    tool.onMouseUp()

    expect(elements.selectedIds).toEqual(['one', 'two'])
    input.dispose()
  })

  it('toggles a clicked element while Ctrl is held', () => {
    const { input, elements, tool } = setup()
    elements.add(rect('one', 0))
    elements.add(rect('two', 200))
    elements.replaceSelection(['one', 'two'])
    elements.calcSelectBox()
    input.state.ctrl = true

    tool.onMouseDown(mouse('pointerdown', 210, 10))
    tool.onMouseUp()

    expect(elements.selectedIds).toEqual(['one'])
    input.dispose()
  })

  it('marquee-selects every intersecting unlocked element', () => {
    const { input, elements, tool } = setup()
    elements.add(rect('one', 0))
    elements.add(rect('two', 200))

    tool.onMouseDown(mouse('pointerdown', -10, -10))
    tool.onMouseMove(mouse('pointermove', 310, 90))
    tool.onMouseUp()

    expect(elements.selectedIds).toEqual(['one', 'two'])
    input.dispose()
  })

  it('resizes from the south-east handle as one undoable gesture', () => {
    const { input, elements, tool } = setup()
    elements.add(rect('one', 0))
    elements.setSelectedElement('one')
    elements.calcSelectBox()

    tool.onMouseDown(mouse('pointerdown', 100, 80))
    tool.onMouseMove(mouse('pointermove', 150, 120))
    tool.onMouseUp()

    expect(elements.getById('one')?.getPanelAttrs()).toMatchObject({
      width: 150,
      height: 120,
    })
    elements.undo()
    expect(elements.getById('one')?.getPanelAttrs()).toMatchObject({
      width: 100,
      height: 80,
    })
    input.dispose()
  })

  it('cancels a transform preview with Escape without adding history', () => {
    const { input, elements, tool } = setup()
    elements.add(rect('one', 0))
    elements.setSelectedElement('one')
    elements.calcSelectBox()

    tool.onMouseDown(mouse('pointerdown', 100, 80))
    tool.onMouseMove(mouse('pointermove', 150, 120))
    tool.onKeyDown(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(elements.getById('one')?.getPanelAttrs()).toMatchObject({
      width: 100,
      height: 80,
    })
    elements.undo()
    expect(elements.getById('one')).toBeUndefined()
    input.dispose()
  })

  it('rotates around the selection center as one undoable gesture', () => {
    const { input, elements, tool } = setup()
    elements.add(rect('one', 0))
    elements.setSelectedElement('one')
    elements.calcSelectBox()

    tool.onMouseDown(mouse('pointerdown', 50, -24))
    tool.onMouseMove(mouse('pointermove', 100, 40))
    tool.onMouseUp()

    expect(elements.getById('one')?.rotation).toBeCloseTo(Math.PI / 2)
    elements.undo()
    expect(elements.getById('one')?.rotation).toBeCloseTo(0)
    input.dispose()
  })
})
