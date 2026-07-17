import { act, renderHook } from '@testing-library/react'
import type { NodeInfo, ToolName } from '@sun-world/editor'
import { useEditorCanvas, type EditorCanvasAdapter } from './useEditorCanvas'

function createFakeEditor() {
  let toolListener = () => undefined
  let zoomListener = (_value: number) => undefined
  let treeListener = (_nodes: NodeInfo[]) => undefined
  const unsubscribeTool = vi.fn()
  const unsubscribeZoom = vi.fn()
  const unsubscribeTree = vi.fn()
  const editor: EditorCanvasAdapter = {
    zoom: 1,
    setTool: vi.fn(),
    getActiveToolName: vi.fn(() => 'drag' as ToolName),
    toolChanged: vi.fn((listener) => {
      toolListener = listener
      return unsubscribeTool
    }),
    onZoomChange: vi.fn((listener) => {
      zoomListener = listener
      return unsubscribeZoom
    }),
    elementTreeChanged: vi.fn((listener) => {
      treeListener = listener
      return unsubscribeTree
    }),
    selectElement: vi.fn(),
    updateElement: vi.fn(),
    save: vi.fn(),
    destroy: vi.fn(),
  }
  return {
    editor,
    emitTool: toolListener,
    emitZoom: zoomListener,
    emitTree: treeListener,
    unsubscribeTool,
    unsubscribeZoom,
    unsubscribeTree,
  }
}

describe('useEditorCanvas', () => {
  it('creates one editor, forwards tools and releases subscriptions on cleanup', () => {
    const fake = createFakeEditor()
    const factory = vi.fn(() => fake.editor)
    const host = document.createElement('div')
    const { result, unmount, rerender } = renderHook(() =>
      useEditorCanvas(host, factory)
    )
    rerender()
    expect(factory).toHaveBeenCalledTimes(1)
    expect(result.current.activeTool).toBe('drag')

    act(() => result.current.selectTool('rect'))
    expect(fake.editor.setTool).toHaveBeenCalledWith('rect')
    act(() => result.current.selectNode('node-1'))
    expect(fake.editor.selectElement).toHaveBeenCalledWith('node-1')
    act(() => result.current.updateSelected({ width: 240 }))
    expect(fake.editor.updateElement).toHaveBeenCalledWith('node-1', {
      width: 240,
    })

    unmount()
    expect(fake.unsubscribeTool).toHaveBeenCalled()
    expect(fake.unsubscribeZoom).toHaveBeenCalled()
    expect(fake.unsubscribeTree).toHaveBeenCalled()
    expect(fake.editor.destroy).toHaveBeenCalled()
  })
})
