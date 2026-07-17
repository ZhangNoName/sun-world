import type { MarkdownHeadingItem } from '../types'

function CatalogItems({
  items,
  activeId,
  onSelect,
}: {
  items: MarkdownHeadingItem[]
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-current={activeId === item.id ? 'location' : undefined}
            onClick={() => onSelect(item.id)}
          >
            {item.text}
          </button>
          {item.children?.length ? (
            <CatalogItems
              items={item.children}
              activeId={activeId}
              onSelect={onSelect}
            />
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function CatalogCard(props: {
  catalog: MarkdownHeadingItem[]
  activeId: string
  onSelect: (id: string) => void
}) {
  return (
    <nav className="catalog-card" aria-label="文章目录">
      <h2>目录</h2>
      <CatalogItems
        items={props.catalog}
        activeId={props.activeId}
        onSelect={props.onSelect}
      />
    </nav>
  )
}
