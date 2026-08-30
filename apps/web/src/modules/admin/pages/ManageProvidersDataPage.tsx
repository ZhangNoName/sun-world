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
import type {
  AdminAiProvider,
  AdminAiProviderAuthMode,
  AdminAiProviderInput,
} from '../types'
import { getAdminErrorMessage } from '../errors'
import { useManageCopy } from '../manageCopy'
import {
  ManageDataPage,
  type ManageDataPageRef,
} from '../components/ManageDataPage'
import { SchemaForm } from '../components/SchemaForm'
import type { ManageColumn, SchemaField } from '../components/ManageTypes'
import './manage-editors.css'

const emptyModel: AdminAiProviderInput = {
  id: '',
  name: '',
  default_base_url: '',
  default_model: '',
  auth_mode: 'none',
  api_key: null,
  clear_api_key: false,
  is_enabled: true,
  is_default: false,
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
  const [mutatingId, setMutatingId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const columns = useMemo<Array<ManageColumn<AdminAiProvider>>>(
    () => [
      {
        key: 'name',
        title: copy.models.service,
        search: {
          label: copy.models.name,
          placeholder: copy.models.searchModel,
        },
        render: ({ row }) => <strong>{row.name}</strong>,
      },
      { key: 'id', title: copy.models.id, search: true },
      { key: 'default_model', title: copy.models.model },
      { key: 'default_base_url', title: copy.models.baseUrl },
      {
        key: 'auth_mode',
        title: copy.models.authMode,
        render: ({ row }) =>
          row.auth_mode === 'none'
            ? copy.models.noAuth
            : copy.models.bearerAuth,
      },
      {
        key: 'has_api_key',
        title: copy.models.credential,
        render: ({ row }) => credentialLabel(row, copy.models),
      },
      {
        key: 'is_enabled',
        title: copy.models.status,
        search: {
          label: copy.models.status,
          type: 'select',
          options: [
            { value: 'true', label: copy.models.enabledStatus },
            { value: 'false', label: copy.models.disabledStatus },
          ],
        },
        render: ({ row }) =>
          row.is_enabled
            ? copy.models.enabledStatus
            : copy.models.disabledStatus,
      },
      {
        key: 'is_default',
        title: copy.models.defaultStatus,
        render: ({ row }) =>
          row.is_default ? (
            <span>
              <SunIcon name="star" size="sm" /> {copy.models.defaultLabel}
            </span>
          ) : (
            copy.models.notDefaultLabel
          ),
      },
      { key: 'sort_order', title: copy.models.order, type: 'number' },
      { key: 'updated_at', title: copy.models.updated, type: 'date' },
      {
        key: 'created_at',
        title: copy.models.actions,
        render: ({ row }) => {
          const isMutating = mutatingId === row.id
          const isProtectedDefault = row.is_default && row.is_enabled
          return (
            <div className="manage-row-actions">
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${copy.models.edit} ${row.name}`}
                disabled={isMutating}
                onClick={() => openEditor(row)}
              >
                <SunIcon name="edit" size="sm" />
                {copy.models.edit}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${row.is_enabled ? copy.models.disable : copy.models.enable} ${row.name}`}
                title={
                  isProtectedDefault ? copy.models.defaultProtected : undefined
                }
                disabled={isMutating || isProtectedDefault}
                onClick={() => void toggleModel(row)}
              >
                <SunIcon name="refresh-cw" size="sm" />
                {row.is_enabled ? copy.models.disable : copy.models.enable}
              </Button>
              {!row.is_default ? (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${copy.models.setDefault} ${row.name}`}
                  disabled={isMutating}
                  onClick={() => void makeDefault(row)}
                >
                  <SunIcon name="star" size="sm" />
                  {copy.models.setDefault}
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${copy.models.delete} ${row.name}`}
                title={
                  row.is_default ? copy.models.defaultProtected : undefined
                }
                disabled={isMutating || row.is_default}
                onClick={() => void removeModel(row)}
              >
                <SunIcon name="trash" size="sm" />
                {copy.models.delete}
              </Button>
            </div>
          )
        },
      },
    ],
    [copy, mutatingId]
  )

  const fields: Array<SchemaField<Record<string, unknown>>> = [
    {
      name: 'id',
      label: copy.models.modelId,
      type: 'input',
      required: true,
      disabled: Boolean(editor?.item),
      placeholder: 'team-chat',
    },
    {
      name: 'name',
      label: copy.models.displayName,
      type: 'input',
      required: true,
    },
    {
      name: 'default_base_url',
      label: copy.models.baseUrl,
      type: 'url',
      required: true,
      placeholder: 'https://models.example.com/v1',
    },
    {
      name: 'default_model',
      label: copy.models.model,
      type: 'input',
      required: true,
      placeholder: 'model-name',
    },
    {
      name: 'auth_mode',
      label: copy.models.authMode,
      type: 'select',
      required: true,
      options: [
        { value: 'none', label: copy.models.noAuth },
        { value: 'bearer', label: copy.models.bearerAuth },
      ],
    },
    ...(editor?.values.auth_mode === 'bearer'
      ? [
          {
            name: 'api_key',
            label: copy.models.apiKey,
            type: 'password' as const,
            required: !editor?.item?.has_api_key,
            placeholder: copy.models.apiKeyPlaceholder,
            description: editor?.item?.has_api_key
              ? copy.models.apiKeyKeepHint
              : undefined,
          },
        ]
      : []),
    { name: 'sort_order', label: copy.models.sortOrder, type: 'number' },
    {
      name: 'is_enabled',
      label: copy.models.enabled,
      type: 'switch',
      disabled: Boolean(editor?.values.is_default),
    },
    {
      name: 'is_default',
      label: copy.models.isDefault,
      type: 'switch',
      disabled: Boolean(editor?.item?.is_default),
    },
  ]

  function openEditor(item: AdminAiProvider | null) {
    setErrorMessage('')
    setEditor({
      item,
      values: item ? modelInput(item) : { ...emptyModel },
    })
  }

  async function saveModel(values: Record<string, unknown>) {
    if (!editor || saving) return
    setSaving(true)
    setErrorMessage('')
    const authMode = normalizeAuthMode(values.auth_mode)
    const isDefault = Boolean(values.is_default)
    const apiKey = String(values.api_key ?? '').trim()
    const payload: AdminAiProviderInput = {
      id: String(values.id ?? '').trim(),
      name: String(values.name ?? '').trim(),
      default_base_url: String(values.default_base_url ?? '').trim() || null,
      default_model: String(values.default_model ?? '').trim() || null,
      auth_mode: authMode,
      api_key: authMode === 'bearer' && apiKey ? apiKey : null,
      clear_api_key: false,
      is_enabled: isDefault || Boolean(values.is_enabled),
      is_default: isDefault,
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

  async function toggleModel(row: AdminAiProvider) {
    if (row.is_default && row.is_enabled) {
      setErrorMessage(copy.models.defaultProtected)
      return
    }
    await mutateModel(row.id, () =>
      updateAdminAiProvider(
        row.id,
        modelInput(row, { is_enabled: !row.is_enabled })
      )
    )
  }

  async function makeDefault(row: AdminAiProvider) {
    await mutateModel(row.id, () =>
      updateAdminAiProvider(
        row.id,
        modelInput(row, { is_enabled: true, is_default: true })
      )
    )
  }

  async function removeModel(row: AdminAiProvider) {
    if (row.is_default) {
      setErrorMessage(copy.models.defaultProtected)
      return
    }
    if (!window.confirm(copy.models.confirmDelete(row.name))) return
    await mutateModel(row.id, () => deleteAdminAiProvider(row.id))
  }

  async function mutateModel(id: string, action: () => Promise<unknown>) {
    if (mutatingId) return
    setMutatingId(id)
    setErrorMessage('')
    try {
      await action()
      await pageRef.current?.refresh()
    } catch (reason) {
      setErrorMessage(getAdminErrorMessage(reason))
    } finally {
      setMutatingId(null)
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
        title={copy.models.title}
        description={copy.models.description}
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
              {copy.models.newModel}
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
            {copy.models.editorTitle(Boolean(editor?.item))}
          </DialogTitle>
          <DialogDescription>{copy.models.editorDescription}</DialogDescription>
          <SchemaForm
            fields={fields}
            values={(editor?.values ?? {}) as Record<string, unknown>}
            onChange={(name, value) =>
              setEditor((current) => {
                if (!current) return current
                const values = { ...current.values, [name]: value }
                if (name === 'auth_mode' && value === 'none') {
                  values.api_key = null
                }
                if (name === 'is_default' && value) {
                  values.is_enabled = true
                }
                return { ...current, values }
              })
            }
            onSubmit={(values) => void saveModel(values)}
            submitting={saving}
            submitLabel={
              editor?.item ? copy.models.saveChanges : copy.models.createModel
            }
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function normalizeAuthMode(value: unknown): AdminAiProviderAuthMode {
  return value === 'bearer' ? 'bearer' : 'none'
}

function modelInput(
  row: AdminAiProvider,
  overrides: Partial<AdminAiProviderInput> = {}
): AdminAiProviderInput {
  return {
    id: row.id,
    name: row.name,
    default_base_url: row.default_base_url ?? null,
    default_model: row.default_model ?? null,
    auth_mode: normalizeAuthMode(row.auth_mode),
    api_key: null,
    clear_api_key: false,
    is_enabled: row.is_enabled,
    is_default: row.is_default,
    sort_order: row.sort_order,
    ...overrides,
  }
}

function credentialLabel(
  row: AdminAiProvider,
  copy: {
    credentialNotRequired: string
    credentialConfigured: string
    credentialMissing: string
  }
) {
  if (row.auth_mode === 'none') return copy.credentialNotRequired
  if (row.has_api_key) return row.api_key_hint || copy.credentialConfigured
  return copy.credentialMissing
}
