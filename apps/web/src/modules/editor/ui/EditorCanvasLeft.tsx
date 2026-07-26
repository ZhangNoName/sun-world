import type { NodeInfo } from '@sun-world/editor'
import { EditorCanvasTree } from './EditorCanvasTree'
export function EditorCanvasLeft(props: {
  nodes: NodeInfo[]
  selectedId: string | null
  onSelect: (
    id: string,
    modifiers?: { additive?: boolean; toggle?: boolean }
  ) => void
}) {
  return (
    <aside className="editor-sidebar editor-sidebar--left">
      <h2>图层</h2>
      <EditorCanvasTree {...props} />
    </aside>
  )
}
