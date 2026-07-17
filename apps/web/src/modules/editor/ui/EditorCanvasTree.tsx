import { useState } from 'react'
import type { NodeInfo } from '@sun-world/editor'
import { SunIcon } from '@sun-world/icons/react'

export function EditorCanvasTree({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: NodeInfo[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  return (
    <div className="editor-tree" role="tree" aria-label="图层">
      {nodes.length ? (
        nodes.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            level={0}
            selectedId={selectedId}
            expanded={expanded}
            onToggle={toggle}
            onSelect={onSelect}
          />
        ))
      ) : (
        <p className="editor-empty">暂无图层，使用矩形工具在画布中创建元素。</p>
      )}
    </div>
  )
}

function TreeNode({
  node,
  level,
  selectedId,
  expanded,
  onToggle,
  onSelect,
}: {
  node: NodeInfo
  level: number
  selectedId: string | null
  expanded: Set<string>
  onToggle: (id: string) => void
  onSelect: (id: string) => void
}) {
  const hasChildren = node.children.length > 0
  const isExpanded = expanded.has(node.id)
  return (
    <div
      role="treeitem"
      aria-selected={selectedId === node.id}
      aria-expanded={hasChildren ? isExpanded : undefined}
    >
      <div
        className={`tree-item ${selectedId === node.id ? 'is-selected' : ''}`}
        style={{ paddingInlineStart: `${8 + level * 16}px` }}
      >
        <button
          type="button"
          className="tree-toggle"
          aria-label={isExpanded ? '折叠图层' : '展开图层'}
          disabled={!hasChildren}
          onClick={() => onToggle(node.id)}
        >
          <SunIcon name={hasChildren ? 'chevron-right' : 'square'} size={14} />
        </button>
        <button
          type="button"
          className="tree-name"
          onClick={() => onSelect(node.id)}
        >
          {node.name || node.type}
        </button>
      </div>
      {hasChildren && isExpanded
        ? node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  )
}
