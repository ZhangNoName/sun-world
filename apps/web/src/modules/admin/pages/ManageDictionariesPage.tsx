import { useMemo, useRef, useState } from 'react'

import { SunIcon } from '@sun-world/icons/react'
import { Button } from '@sun-world/base-ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@sun-world/base-ui/dialog'

import {
  createAdminDictionaryItem,
  createAdminDictionaryType,
  deleteAdminDictionaryItem,
  deleteAdminDictionaryType,
  fetchAdminDictionaryItems,
  fetchAdminDictionaryTypes,
  type AdminDictionaryItem,
  type AdminDictionaryItemInput,
  type AdminDictionaryType,
  type AdminDictionaryTypeInput,
  updateAdminDictionaryItem,
  updateAdminDictionaryType,
} from '../api'
import { invalidateDictionary } from '../data/dictionaryRepository'
import { getAdminErrorMessage } from '../errors'
import { useManageCopy } from '../manageCopy'
import {
  ManageDataPage,
  type ManageDataPageRef,
} from '../components/ManageDataPage'
import { SchemaForm } from '../components/SchemaForm'
import type { ManageColumn, SchemaField } from '../components/ManageTypes'
import './manage-editors.css'

const emptyType: AdminDictionaryTypeInput = {
  code: '',
  name: '',
  description: '',
  is_enabled: true,
}
const emptyItem: AdminDictionaryItemInput = {
  value: '',
  label: '',
  color: '',
  sort_order: 0,
  is_enabled: true,
}

type EditorState =
  | {
      kind: 'type'
      item: AdminDictionaryType | null
      values: AdminDictionaryTypeInput
    }
  | {
      kind: 'item'
      item: AdminDictionaryItem | null
      values: AdminDictionaryItemInput
      typeId: number
    }
  | null

export default function ManageDictionariesPage() {
  const copy = useManageCopy()
  const typePageRef = useRef<ManageDataPageRef<AdminDictionaryType>>(null)
  const itemPageRef = useRef<ManageDataPageRef<AdminDictionaryItem>>(null)
  const [editor, setEditor] = useState<EditorState>(null)
  const [selectedType, setSelectedType] = useState<AdminDictionaryType | null>(
    null
  )
  const [errorMessage, setErrorMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const openTypeEditor = (item: AdminDictionaryType | null) => {
    setErrorMessage('')
    setEditor({
      kind: 'type',
      item,
      values: item
        ? {
            code: item.code,
            name: item.name,
            description: item.description ?? '',
            is_enabled: item.is_enabled,
          }
        : { ...emptyType },
    })
  }

  const openItemEditor = (item: AdminDictionaryItem | null) => {
    if (!selectedType) return
    setErrorMessage('')
    setEditor({
      kind: 'item',
      item,
      typeId: selectedType.id,
      values: item
        ? {
            value: item.value,
            label: item.label,
            color: item.color ?? '',
            sort_order: item.sort_order,
            is_enabled: item.is_enabled,
          }
        : { ...emptyItem },
    })
  }

  const typeColumns = useMemo<Array<ManageColumn<AdminDictionaryType>>>(
    () => [
      {
        key: 'code',
        title: copy.dictionaries.code,
        search: {
          label: copy.dictionaries.code,
          placeholder: copy.dictionaries.searchCode,
        },
      },
      {
        key: 'name',
        title: copy.dictionaries.name,
        search: {
          label: copy.dictionaries.name,
          placeholder: copy.dictionaries.searchName,
        },
      },
      {
        key: 'description',
        title: copy.dictionaries.description,
        formatter: (value) =>
          value == null || value === '' ? '—' : String(value),
      },
      {
        key: 'is_enabled',
        title: copy.dictionaries.status,
        type: 'boolean',
        search: { label: copy.dictionaries.enabled, type: 'switch' },
      },
      { key: 'updated_at', title: copy.dictionaries.updated, type: 'date' },
      {
        key: 'id',
        title: copy.dictionaries.actions,
        render: ({ row }) => (
          <div className="manage-row-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedType(row)}
            >
              {copy.dictionaries.items}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openTypeEditor(row)}
            >
              {copy.dictionaries.edit}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void removeType(row)}
            >
              {copy.dictionaries.delete}
            </Button>
          </div>
        ),
      },
    ],
    [copy]
  )

  const itemColumns = useMemo<Array<ManageColumn<AdminDictionaryItem>>>(
    () => [
      { key: 'value', title: copy.dictionaries.value, search: true },
      { key: 'label', title: copy.dictionaries.label, search: true },
      {
        key: 'color',
        title: copy.dictionaries.color,
        formatter: (value) =>
          value == null || value === '' ? '—' : String(value),
      },
      { key: 'sort_order', title: copy.dictionaries.order, type: 'number' },
      { key: 'is_enabled', title: copy.dictionaries.status, type: 'boolean' },
      {
        key: 'id',
        title: copy.dictionaries.actions,
        render: ({ row }) => (
          <div className="manage-row-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openItemEditor(row)}
            >
              {copy.dictionaries.edit}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void removeItem(row)}
            >
              {copy.dictionaries.delete}
            </Button>
          </div>
        ),
      },
    ],
    [copy, selectedType]
  )

  async function saveEditor(values: Record<string, unknown>) {
    if (!editor || saving) return
    setSaving(true)
    setErrorMessage('')
    try {
      if (editor.kind === 'type') {
        const payload = values as unknown as AdminDictionaryTypeInput
        if (editor.item)
          await updateAdminDictionaryType(editor.item.id, payload)
        else await createAdminDictionaryType(payload)
        await typePageRef.current?.refresh()
      } else {
        const payload = values as unknown as AdminDictionaryItemInput
        if (editor.item)
          await updateAdminDictionaryItem(
            editor.typeId,
            editor.item.id,
            payload
          )
        else await createAdminDictionaryItem(editor.typeId, payload)
        invalidateDictionary(selectedType?.code ?? '')
        await itemPageRef.current?.refresh()
      }
      setEditor(null)
    } catch (reason) {
      setErrorMessage(getAdminErrorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  async function removeType(row: AdminDictionaryType) {
    if (!window.confirm(copy.dictionaries.confirmTypeDelete(row.code))) return
    setErrorMessage('')
    try {
      await deleteAdminDictionaryType(row.id)
      if (selectedType?.id === row.id) setSelectedType(null)
      invalidateDictionary(row.code)
      await typePageRef.current?.refresh()
    } catch (reason) {
      setErrorMessage(getAdminErrorMessage(reason))
    }
  }

  async function removeItem(row: AdminDictionaryItem) {
    if (
      !selectedType ||
      !window.confirm(copy.dictionaries.confirmItemDelete(row.value))
    )
      return
    setErrorMessage('')
    try {
      await deleteAdminDictionaryItem(selectedType.id, row.id)
      invalidateDictionary(selectedType.code)
      await itemPageRef.current?.refresh()
    } catch (reason) {
      setErrorMessage(getAdminErrorMessage(reason))
    }
  }

  const editorFields: Array<SchemaField<Record<string, unknown>>> =
    editor?.kind === 'item'
      ? [
          {
            name: 'value',
            label: copy.dictionaries.value,
            type: 'input',
            required: true,
            disabled: Boolean(editor.item),
          },
          {
            name: 'label',
            label: copy.dictionaries.label,
            type: 'input',
            required: true,
          },
          {
            name: 'color',
            label: copy.dictionaries.color,
            type: 'input',
            placeholder: '#22c55e',
          },
          {
            name: 'sort_order',
            label: copy.dictionaries.order,
            type: 'number',
          },
          {
            name: 'is_enabled',
            label: copy.dictionaries.enabled,
            type: 'switch',
          },
        ]
      : [
          {
            name: 'code',
            label: copy.dictionaries.code,
            type: 'input',
            required: true,
            disabled: Boolean(editor?.item),
          },
          {
            name: 'name',
            label: copy.dictionaries.name,
            type: 'input',
            required: true,
          },
          {
            name: 'description',
            label: copy.dictionaries.description,
            type: 'textarea',
          },
          {
            name: 'is_enabled',
            label: copy.dictionaries.enabled,
            type: 'switch',
          },
        ]

  return (
    <div className="manage-dictionaries-page">
      {errorMessage ? (
        <p className="manage-editor-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <ManageDataPage
        ref={typePageRef}
        title={copy.dictionaries.title}
        description={copy.dictionaries.pageDescription}
        columns={typeColumns}
        rowKey={(row) => row.id}
        fetchPage={async ({ page, pageSize, search }) => {
          const result = await fetchAdminDictionaryTypes({
            page,
            pageSize,
            keyword: String(search.code || search.name || ''),
          })
          return {
            rows: result.list,
            total: result.total,
            page: result.page,
            pageSize: result.page_size,
          }
        }}
        toolbar={{
          right: (
            <Button onClick={() => openTypeEditor(null)}>
              <SunIcon name="plus" />
              {copy.dictionaries.newDictionary}
            </Button>
          ),
        }}
      />
      {selectedType ? (
        <ManageDataPage
          ref={itemPageRef}
          title={copy.dictionaries.itemTitle(selectedType.code)}
          description={copy.dictionaries.itemDescription(selectedType.name)}
          columns={itemColumns}
          rowKey={(row) => row.id}
          fetchPage={async ({ page, pageSize, search }) => {
            const result = await fetchAdminDictionaryItems(selectedType.id, {
              page,
              pageSize,
              keyword: String(search.value || search.label || ''),
            })
            return {
              rows: result.list,
              total: result.total,
              page: result.page,
              pageSize: result.page_size,
            }
          }}
          toolbar={{
            left: (
              <Button variant="ghost" onClick={() => setSelectedType(null)}>
                {copy.dictionaries.backToTypes}
              </Button>
            ),
            right: (
              <Button onClick={() => openItemEditor(null)}>
                <SunIcon name="plus" />
                {copy.dictionaries.newItem}
              </Button>
            ),
          }}
        />
      ) : null}
      <Dialog
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open && !saving) setEditor(null)
        }}
      >
        <DialogContent className="manage-editor-drawer">
          <DialogTitle>
            {editor?.kind === 'item'
              ? copy.dictionaries.dictionaryItem
              : copy.dictionaries.dictionaryType}
          </DialogTitle>
          <DialogDescription>
            {copy.dictionaries.changesApplied}
          </DialogDescription>
          <SchemaForm
            fields={editorFields}
            values={(editor?.values ?? {}) as Record<string, unknown>}
            onChange={(name, value) => {
              setEditor((current) =>
                current
                  ? ({
                      ...current,
                      values: { ...current.values, [name]: value },
                    } as EditorState)
                  : current
              )
            }}
            onSubmit={(values) => void saveEditor(values)}
            submitting={saving}
            submitLabel={copy.dictionaries.save}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
