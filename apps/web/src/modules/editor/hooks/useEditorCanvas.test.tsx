import { act, renderHook } from '@testing-library/react'
import type { NodeInfo, ToolName } from '@sun-world/editor'
import type { HistoryState } from '@sun-world/editor'
import { useEditorCanvas, type EditorCanvasAdapter } from './useEditorCanvas'

function createFakeEditor() {
  let toolListener = () => undefined
  let zoomListener = (_value: number) => undefined
  let treeListener = (_nodes: NodeInfo[]) => undefined
  let historyListener = (_state: HistoryState) => undefined
  let selectionListener = (_ids: readonly string[]) => undefined
  let elementsListener = () => undefined
  const unsubscribeTool = vi.fn()
  const unsubscribeZoom = vi.fn()
  const unsubscribeTree = vi.fn()
  const unsubscribeHistory = vi.fn()
  const unsubscribeSelection = vi.fn()
  const unsubscribeElements = vi.fn()
  let panelAttrs = { width: 100 }
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
    historyChanged: vi.fn((listener) => {
      historyListener = listener
      return unsubscribeHistory
    }),
    selectionChanged: vi.fn((listener) => {
      selectionListener = listener
      return unsubscribeSelection
    }),
    elementManagerChanged: vi.fn((listener) => {
      elementsListener = listener
      return unsubscribeElements
    }),
    undo: vi.fn(),
    redo: vi.fn(),
    selectElement: vi.fn(),
    getElementPanelAttrs: vi.fn(() => panelAttrs),
    updateElement: vi.fn(),
    save: vi.fn(async () => undefined),
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
    unsubscribeHistory,
    unsubscribeSelection,
    unsubscribeElements,
    emitHistory: (state: HistoryState) => historyListener(state),
    emitSelection: (ids: readonly string[]) => selectionListener(ids),
    emitElements: (attrs: { width: number }) => {
      panelAttrs = attrs
      elementsListener()
    },
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
    act(() => result.current.selectNode('node-1', { additive: true }))
    expect(fake.editor.selectElement).toHaveBeenCalledWith('node-1', {
      additive: true,
    })
    act(() => result.current.updateSelected({ width: 240 }))
    expect(fake.editor.updateElement).toHaveBeenCalledWith('node-1', {
      width: 240,
    })

    unmount()
    expect(fake.unsubscribeTool).toHaveBeenCalled()
    expect(fake.unsubscribeZoom).toHaveBeenCalled()
    expect(fake.unsubscribeTree).toHaveBeenCalled()
    expect(fake.unsubscribeHistory).toHaveBeenCalled()
    expect(fake.unsubscribeSelection).toHaveBeenCalled()
    expect(fake.unsubscribeElements).toHaveBeenCalled()
    expect(fake.editor.destroy).toHaveBeenCalled()
  })

  it('tracks history and multi-selection and forwards undo and redo', () => {
    const fake = createFakeEditor()
    const host = document.createElement('div')
    const factory = vi.fn(() => fake.editor)
    const { result } = renderHook(() => useEditorCanvas(host, factory))

    act(() => fake.emitHistory({ canUndo: true, canRedo: false }))
    act(() => fake.emitSelection(['one', 'two']))
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.selectedIds).toEqual(['one', 'two'])

    act(() => result.current.undo())
    act(() => result.current.redo())
    expect(fake.editor.undo).toHaveBeenCalledOnce()
    expect(fake.editor.redo).toHaveBeenCalledOnce()
  })

  it('refreshes selected attributes after a canvas transform', () => {
    const fake = createFakeEditor()
    const factory = vi.fn(() => fake.editor)
    const host = document.createElement('div')
    const { result } = renderHook(() => useEditorCanvas(host, factory))

    act(() => fake.emitSelection(['one']))
    expect(result.current.selectedAttrs).toEqual({ width: 100 })
    act(() => fake.emitElements({ width: 220 }))
    expect(result.current.selectedAttrs).toEqual({ width: 220 })
  })

  it('reports asynchronous save progress and completion', async () => {
    let finishSave: () => void = () => undefined
    const fake = createFakeEditor()
    vi.mocked(fake.editor.save).mockImplementation(
      () => new Promise<void>((resolve) => (finishSave = resolve))
    )
    const host = document.createElement('div')
    const factory = vi.fn(() => fake.editor)
    const { result } = renderHook(() => useEditorCanvas(host, factory))

    let savePromise: Promise<void> | undefined
    act(() => {
      savePromise = result.current.save()
    })
    expect(result.current.saveStatus).toBe('saving')
    await act(async () => {
      finishSave()
      await savePromise
    })
    expect(result.current.saveStatus).toBe('saved')
  })
})
