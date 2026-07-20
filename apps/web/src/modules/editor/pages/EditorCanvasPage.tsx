import { useState } from 'react'
import type { ToolName } from '@sun-world/editor'
import { SunIcon, type SunIconProps } from '@sun-world/icons/react'
import { Button } from '@sun-world/ui/button'
import { useEditorCanvas } from '../hooks/useEditorCanvas'
import { EditorCanvasLeft } from '../ui/EditorCanvasLeft'
import { EditorCanvasRight } from '../ui/EditorCanvasRight'
import './editor-canvas.css'

const tools: Array<{
  name: ToolName
  label: string
  icon: SunIconProps['name']
}> = [
  { name: 'select', label: '选择', icon: 'arrow' },
  { name: 'drag', label: '拖动画布', icon: 'canvas' },
  { name: 'comment', label: '批注', icon: 'message-circle' },
  { name: 'rect', label: '矩形', icon: 'square' },
]

export function EditorCanvasPage() {
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  const canvas = useEditorCanvas(host)
  return (
    <main className="canvas-page">
      <EditorCanvasLeft
        nodes={canvas.nodes}
        selectedId={canvas.selectedId}
        onSelect={canvas.selectNode}
      />
      <div className="canvas-host" ref={setHost} aria-label="画布编辑区域" />
      <EditorCanvasRight
        zoom={canvas.zoom}
        name={canvas.selectedNode?.name}
        attrs={canvas.selectedAttrs}
        onUpdate={canvas.updateSelected}
      />
      <div className="canvas-toolbar" role="toolbar" aria-label="画布工具">
        {tools.map((tool) => (
          <Button
            type="button"
            key={tool.name}
            className={canvas.activeTool === tool.name ? 'is-active' : ''}
            aria-label={tool.label}
            aria-pressed={canvas.activeTool === tool.name}
            onClick={() => canvas.selectTool(tool.name)}
          >
            <SunIcon name={tool.icon} size={20} />
          </Button>
        ))}
        <Button size="sm" variant="secondary" onClick={canvas.save}>
          保存
        </Button>
      </div>
    </main>
  )
}
export default EditorCanvasPage
