import type { ReactNode } from 'react'

import { cn } from '../lib/cn'
import '../styles/base.css'
import '../styles/list.css'

export interface SunListItem {
  id: string | number
  [key: string]: unknown
}
export interface SunListColumn<TItem> {
  key: keyof TItem & string
  label: string
}
export interface SunListProps<TItem extends SunListItem> {
  items: TItem[]
  columns?: SunListColumn<TItem>[]
  onSelect?: (item: TItem) => void
  label?: string
  loading?: boolean
  disabled?: boolean
  mobile?: boolean
  emptyText?: string
  renderItem?: (item: TItem) => ReactNode
}

export function SunList<TItem extends SunListItem>({
  items,
  columns = [],
  onSelect,
  label,
  loading,
  disabled,
  mobile,
  emptyText = 'No data',
  renderItem,
}: SunListProps<TItem>) {
  const resolvedColumns =
    columns.length > 0
      ? columns
      : (
          (items[0]
            ? Object.keys(items[0]).filter((key) => key !== 'id')
            : []) as Array<keyof TItem & string>
        ).map((key) => ({ key, label: key }))
  return (
    <section
      className={cn('sun-list', mobile && 'sun-list--mobile')}
      aria-label={label}
    >
      {label ? <div className="sun-ui-label">{label}</div> : null}
      {loading ? <div className="sun-list__state">Loading…</div> : null}
      {!loading && items.length === 0 ? (
        <div className="sun-list__state">{emptyText}</div>
      ) : null}
      {!loading ? (
        <div className={mobile ? 'sun-list__cards' : 'sun-list__rows'}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              data-sun-list-card={mobile || undefined}
              data-sun-list-row={String(item.id)}
              className={mobile ? 'sun-list-card' : 'sun-list-row'}
              disabled={disabled}
              onClick={() => onSelect?.(item)}
            >
              {renderItem?.(item) ??
                resolvedColumns.map((column) => (
                  <span key={column.key} className="sun-list-card__line">
                    <span className="sun-list-card__label">{column.label}</span>
                    <span>{String(item[column.key] ?? '')}</span>
                  </span>
                ))}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
