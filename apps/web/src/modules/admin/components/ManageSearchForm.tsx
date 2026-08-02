import { useMemo, useState } from 'react'

import { Button } from '@sun-world/base-ui/button'

import { useManageCopy } from '../manageCopy'
import { SchemaForm } from './SchemaForm'
import type { ManageColumn, SchemaField } from './ManageTypes'

export interface ManageSearchFormProps<T> {
  columns: Array<ManageColumn<T>>
  values: Record<string, unknown>
  onChange: (name: string, value: unknown) => void
  onSubmit: (values: Record<string, unknown>) => Promise<void> | void
  onReset: () => Promise<void> | void
  submitting?: boolean
  compact?: boolean
}

export function ManageSearchForm<T>({
  columns,
  values,
  onChange,
  onSubmit,
  onReset,
  submitting,
  compact = false,
}: ManageSearchFormProps<T>) {
  const copy = useManageCopy()
  const [expanded, setExpanded] = useState(false)
  const fields = useMemo<Array<SchemaField<Record<string, unknown>>>>(
    () =>
      columns
        .filter((column) => column.search)
        .map((column) => {
          const config = typeof column.search === 'object' ? column.search : {}
          const inferredType =
            config.type ??
            (column.type === 'dict'
              ? 'dict'
              : column.type === 'number'
                ? 'number'
                : 'input')
          return {
            name: column.key,
            label: config.label ?? column.title,
            type: inferredType,
            placeholder: config.placeholder,
            options: config.options,
            dictCode: column.dictCode,
          } as SchemaField<Record<string, unknown>>
        }),
    [columns]
  )
  const visibleFields = expanded ? fields : fields.slice(0, 3)
  const schemaForm = (
    <SchemaForm
      fields={visibleFields}
      values={values}
      onChange={onChange}
      onSubmit={onSubmit}
      submitting={submitting}
      submitLabel={copy.search.submit}
      actions={
        <Button
          type="button"
          variant="ghost"
          disabled={submitting}
          onClick={() => void onReset()}
        >
          {copy.search.reset}
        </Button>
      }
    />
  )

  return (
    <section
      className={compact ? 'manage-search-inline' : 'manage-search-card'}
      aria-labelledby="manage-search-title"
    >
      <h2 className="manage-visually-hidden" id="manage-search-title">
        {copy.search.title}
      </h2>
      <div
        className={
          compact
            ? 'manage-search-inline__content'
            : 'manage-search-card__heading'
        }
      >
        {fields.length > 3 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? copy.search.collapse : copy.search.moreFilters}
          </Button>
        ) : null}
        {compact ? schemaForm : null}
      </div>
      {compact ? null : schemaForm}
    </section>
  )
}
