import { SunInput } from '@sun-world/ui/input'
import type { EditorElementPatch } from '../hooks/useEditorCanvas'

export function EditorCanvasRight({
  zoom,
  name,
  attrs,
  onUpdate,
}: {
  zoom: number
  name?: string
  attrs: EditorElementPatch | null
  onUpdate: (patch: EditorElementPatch) => void
}) {
  return (
    <aside className="editor-sidebar editor-sidebar--right">
      <h2>属性</h2>
      <p className="zoom-label">
        缩放 {new Intl.NumberFormat('zh-CN', { style: 'percent' }).format(zoom)}
      </p>
      {attrs ? (
        <div className="property-form">
          <SunInput
            label="名称"
            value={attrs.name ?? name ?? ''}
            onValueCommit={(value) => onUpdate({ name: value })}
          />
          {(['x', 'y', 'width', 'height', 'rotation'] as const).map((key) => (
            <SunInput
              key={key}
              label={key.toUpperCase()}
              type="number"
              value={String(attrs[key] ?? 0)}
              onValueCommit={(value) => {
                const numeric = Number(value)
                if (Number.isFinite(numeric)) onUpdate({ [key]: numeric })
              }}
            />
          ))}
        </div>
      ) : (
        <p className="editor-empty">选择图层后可编辑几何属性。</p>
      )}
    </aside>
  )
}
