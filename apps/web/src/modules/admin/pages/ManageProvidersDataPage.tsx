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
  createAdminAiProvider,
  deleteAdminAiProvider,
  fetchAdminAiProviders,
  updateAdminAiProvider,
} from '../api'
import type { AdminAiProvider, AdminAiProviderInput } from '../types'
import { getAdminErrorMessage } from '../errors'
import { useManageCopy } from '../manageCopy'
import {
  ManageDataPage,
  type ManageDataPageRef,
} from '../components/ManageDataPage'
import { SchemaForm } from '../components/SchemaForm'
import type { ManageColumn, SchemaField } from '../components/ManageTypes'
import './manage-editors.css'

const emptyProvider: AdminAiProviderInput = {
  id: '',
  name: '',
  default_base_url: '',
  default_model: '',
  is_enabled: true,
  sort_order: 0,
}

export default function ManageProvidersDataPage() {
  const copy = useManageCopy()
  const pageRef = useRef<ManageDataPageRef<AdminAiProvider>>(null)
  const [editor, setEditor] = useState<{
    item: AdminAiProvider | null
    values: AdminAiProviderInput
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const columns = useMemo<Array<ManageColumn<AdminAiProvider>>>(
    () => [
      {
        key: 'name',
        title: copy.providers.provider,
        search: {
          label: copy.providers.name,
          placeholder: copy.providers.searchProvider,
        },
      },
      { key: 'id', title: copy.providers.id, search: true },
      { key: 'default_model', title: copy.providers.defaultModel },
      { key: 'default_base_url', title: copy.providers.baseUrl },
      {
        key: 'is_enabled',
        title: copy.providers.status,
        type: 'dict',
        dictCode: 'enabled_status',
        search: { label: copy.providers.status, type: 'dict' },
      },
      { key: 'sort_order', title: copy.providers.order, type: 'number' },
      { key: 'updated_at', title: copy.providers.updated, type: 'date' },
      {
        key: 'id',
        title: copy.providers.actions,
        render: ({ row }) => (
          <div className="manage-row-actions">
            <Button variant="ghost" size="sm" onClick={() => openEditor(row)}>
              {copy.providers.edit}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void removeProvider(row)}
            >
              {copy.providers.delete}
            </Button>
          </div>
        ),
      },
    ],
    [copy]
  )

  const fields: Array<SchemaField<Record<string, unknown>>> = [
    {
      name: 'id',
      label: copy.providers.providerId,
      type: 'input',
      required: true,
      disabled: Boolean(editor?.item),
      placeholder: 'deepseek',
    },
    {
      name: 'name',
      label: copy.providers.displayName,
      type: 'input',
      required: true,
    },
    {
      name: 'default_base_url',
      label: copy.providers.defaultBaseUrl,
      type: 'input',
    },
    {
      name: 'default_model',
      label: copy.providers.defaultModel,
      type: 'input',
    },
    { name: 'sort_order', label: copy.providers.sortOrder, type: 'number' },
    { name: 'is_enabled', label: copy.providers.enabled, type: 'switch' },
  ]

  function openEditor(item: AdminAiProvider | null) {
    setErrorMessage('')
    setEditor({
      item,
      values: item
        ? {
            id: item.id,
            name: item.name,
            default_base_url: item.default_base_url ?? '',
            default_model: item.default_model ?? '',
            is_enabled: item.is_enabled,
            sort_order: item.sort_order,
          }
        : { ...emptyProvider },
    })
  }

  async function saveProvider(values: Record<string, unknown>) {
    if (!editor || saving) return
    setSaving(true)
    setErrorMessage('')
    const payload: AdminAiProviderInput = {
      id: String(values.id ?? '').trim(),
      name: String(values.name ?? '').trim(),
      default_base_url: String(values.default_base_url ?? '').trim() || null,
      default_model: String(values.default_model ?? '').trim() || null,
      is_enabled: Boolean(values.is_enabled),
      sort_order: Number(values.sort_order) || 0,
    }
    try {
      if (editor.item) await updateAdminAiProvider(editor.item.id, payload)
      else await createAdminAiProvider(payload)
      setEditor(null)
      await pageRef.current?.refresh()
    } catch (reason) {
      setErrorMessage(getAdminErrorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  async function removeProvider(row: AdminAiProvider) {
    if (!window.confirm(copy.providers.confirmDelete(row.name))) return
    setErrorMessage('')
    try {
      await deleteAdminAiProvider(row.id)
      await pageRef.current?.refresh()
    } catch (reason) {
      setErrorMessage(getAdminErrorMessage(reason))
    }
  }

  return (
    <div className="manage-dictionaries-page">
      {errorMessage ? (
        <p className="manage-editor-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <ManageDataPage
        ref={pageRef}
        title={copy.providers.title}
        description={copy.providers.description}
        columns={columns}
        rowKey={(row) => row.id}
        fetchPage={async ({ page, pageSize, search }) => {
          const all = await fetchAdminAiProviders()
          const name = String(search.name ?? '')
            .trim()
            .toLowerCase()
          const id = String(search.id ?? '')
            .trim()
            .toLowerCase()
          const status = String(search.is_enabled ?? '').trim()
          const filtered = all.filter(
            (row) =>
              (!name || row.name.toLowerCase().includes(name)) &&
              (!id || row.id.toLowerCase().includes(id)) &&
              (!status || String(row.is_enabled) === status)
          )
          const start = (page - 1) * pageSize
          return {
            rows: filtered.slice(start, start + pageSize),
            total: filtered.length,
          }
        }}
        toolbar={{
          right: (
            <Button onClick={() => openEditor(null)}>
              <SunIcon name="plus" />
              {copy.providers.newProvider}
            </Button>
          ),
        }}
      />
      <Dialog
        open={Boolean(editor)}
        onOpenChange={(open) => {
          if (!open && !saving) setEditor(null)
        }}
      >
        <DialogContent className="manage-editor-drawer">
          <DialogTitle>
            {copy.providers.editorTitle(Boolean(editor?.item))}
          </DialogTitle>
          <DialogDescription>
            {copy.providers.editorDescription}
          </DialogDescription>
          <SchemaForm
            fields={fields}
            values={(editor?.values ?? {}) as Record<string, unknown>}
            onChange={(name, value) =>
              setEditor((current) =>
                current
                  ? { ...current, values: { ...current.values, [name]: value } }
                  : current
              )
            }
            onSubmit={(values) => void saveProvider(values)}
            submitting={saving}
            submitLabel={
              editor?.item
                ? copy.providers.saveChanges
                : copy.providers.createProvider
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
