import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  SWEditor,
  type HistoryState,
  type NodeInfo,
  type ToolName,
} from '@sun-world/editor'

export interface EditorElementPatch {
  x?: number
  y?: number
  width?: number
  height?: number
  rotation?: number
  name?: string
  visible?: boolean
  locked?: boolean
}
export interface EditorCanvasAdapter {
  readonly zoom: number
  setTool(name: ToolName): void
  getActiveToolName(): ToolName | null
  toolChanged(listener: () => void): void | (() => void)
  onZoomChange(listener: (zoom: number) => void): void | (() => void)
  elementTreeChanged(listener: (nodes: NodeInfo[]) => void): void | (() => void)
  historyChanged(listener: (state: HistoryState) => void): void | (() => void)
  selectionChanged(
    listener: (ids: readonly string[]) => void
  ): void | (() => void)
  undo(): boolean
  redo(): boolean
  selectElement(
    id: string,
    modifiers?: { additive?: boolean; toggle?: boolean }
  ): void
  getElementPanelAttrs?(id: string): EditorElementPatch | null
  updateElement(id: string, patch: EditorElementPatch): void
  save(): void | Promise<void>
  destroy(): void
}
export type EditorFactory = (host: HTMLDivElement) => EditorCanvasAdapter
const createEditor: EditorFactory = (host) =>
  new SWEditor({ containerElement: host })

export function useEditorCanvas(
  host: HTMLDivElement | null,
  factory: EditorFactory = createEditor
) {
  const [editor, setEditor] = useState<EditorCanvasAdapter | null>(null)
  const [activeTool, setActiveTool] = useState<ToolName | null>(null)
  const [zoom, setZoom] = useState(1)
  const [nodes, setNodes] = useState<NodeInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [selectedAttrs, setSelectedAttrs] = useState<EditorElementPatch | null>(
    null
  )

  useEffect(() => {
    if (!host) return
    const instance = factory(host)
    setEditor(instance)
    setActiveTool(instance.getActiveToolName())
    setZoom(instance.zoom)
    const cleanups = [
      instance.toolChanged(() => setActiveTool(instance.getActiveToolName())),
      instance.onZoomChange(setZoom),
      instance.elementTreeChanged(setNodes),
      instance.historyChanged((state) => {
        setCanUndo(state.canUndo)
        setCanRedo(state.canRedo)
      }),
      instance.selectionChanged((ids) => {
        setSelectedIds([...ids])
        setSelectedId(ids.length === 1 ? ids[0] : null)
        setSelectedAttrs(
          ids.length === 1
            ? (instance.getElementPanelAttrs?.(ids[0]) ?? null)
            : null
        )
      }),
    ]
    return () => {
      cleanups.forEach((cleanup) => cleanup?.())
      instance.destroy()
      setEditor(null)
    }
  }, [factory, host])

  const selectTool = useCallback(
    (tool: ToolName) => editor?.setTool(tool),
    [editor]
  )
  const selectNode = useCallback(
    (id: string, modifiers?: { additive?: boolean; toggle?: boolean }) => {
      editor?.selectElement(id, modifiers)
      setSelectedId(id)
      setSelectedAttrs(editor?.getElementPanelAttrs?.(id) ?? null)
    },
    [editor]
  )
  const updateSelected = useCallback(
    (patch: EditorElementPatch) => {
      if (!editor || !selectedId) return
      editor.updateElement(selectedId, patch)
      setSelectedAttrs((current) => ({ ...current, ...patch }))
    },
    [editor, selectedId]
  )
  const selectedNode = useMemo(
    () => findNode(nodes, selectedId),
    [nodes, selectedId]
  )
  const save = useCallback(async () => {
    if (!editor) return
    setSaveStatus('saving')
    try {
      await editor.save()
      setSaveStatus('saved')
    } catch (error) {
      setSaveStatus('error')
      throw error
    }
  }, [editor])

  return {
    editor,
    activeTool,
    zoom,
    nodes,
    selectedId,
    selectedIds,
    selectedNode,
    selectedAttrs,
    selectTool,
    selectNode,
    updateSelected,
    canUndo,
    canRedo,
    undo: () => editor?.undo(),
    redo: () => editor?.redo(),
    saveStatus,
    save,
  }
}

function findNode(nodes: NodeInfo[], id: string | null): NodeInfo | null {
  if (!id) return null
  for (const node of nodes) {
    if (node.id === id) return node
    const child = findNode(node.children, id)
    if (child) return child
  }
  return null
}
