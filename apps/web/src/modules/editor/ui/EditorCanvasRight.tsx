import { SwInput } from '@sun-world/ui/sw-input'
import type { EditorElementPatch } from '../hooks/useEditorCanvas'

export function EditorCanvasRight({
  zoom,
  selectedCount,
  name,
  attrs,
  onUpdate,
}: {
  zoom: number
  selectedCount: number
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
      {selectedCount > 1 ? (
        <p className="editor-empty">已选择 {selectedCount} 个图层</p>
      ) : attrs ? (
        <div className="property-form">
          <SwInput
            key={`name:${attrs.name ?? name ?? ''}`}
            label="名称"
            defaultValue={attrs.name ?? name ?? ''}
            onValueCommit={(value) => onUpdate({ name: value })}
          />
          {(['x', 'y', 'width', 'height', 'rotation'] as const).map((key) => (
            <SwInput
              key={`${key}:${attrs[key] ?? 0}`}
              label={key.toUpperCase()}
              type="number"
              defaultValue={String(attrs[key] ?? 0)}
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
