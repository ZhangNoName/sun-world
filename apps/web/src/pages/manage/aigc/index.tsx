import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router'
import { Button } from '@sun-world/base-ui/button'
import { SwInput } from '@sun-world/ui/sw-input'
import { SwSelect } from '@sun-world/ui/sw-select'
import {
  createAdminAiProvider,
  deleteAdminAiProvider,
  fetchAdminAiProviders,
  updateAdminAiProvider,
} from '@/modules/admin/api'
import type {
  AdminAiProvider,
  AdminAiProviderInput,
} from '@/modules/admin/types'
import { getAdminErrorMessage } from '@/modules/admin/errors'

const emptyForm: AdminAiProviderInput = {
  id: '',
  name: '',
  default_base_url: '',
  default_model: '',
  is_enabled: true,
  sort_order: 0,
}

export default function ManageAigcPage() {
  const [providers, setProviders] = useState<AdminAiProvider[]>([])
  const [form, setForm] = useState<AdminAiProviderInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadProviders = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setProviders(await fetchAdminAiProviders())
    } catch (reason) {
      setError(getAdminErrorMessage(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadProviders()
  }, [loadProviders])

  const resetForm = () => {
    setForm(emptyForm)
    setEditingId(null)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (editingId) {
        await updateAdminAiProvider(editingId, form)
      } else {
        await createAdminAiProvider(form)
      }
      resetForm()
      await loadProviders()
    } catch (reason) {
      setError(getAdminErrorMessage(reason))
    } finally {
      setSaving(false)
    }
  }

  const editProvider = (provider: AdminAiProvider) => {
    setEditingId(provider.id)
    setForm({
      id: provider.id,
      name: provider.name,
      default_base_url: provider.default_base_url,
      default_model: provider.default_model,
      is_enabled: provider.is_enabled,
      sort_order: provider.sort_order,
    })
  }

  const removeProvider = async (provider: AdminAiProvider) => {
    if (!window.confirm(`确定删除供应商“${provider.name}”吗？`)) return
    setError(null)
    try {
      await deleteAdminAiProvider(provider.id)
      if (editingId === provider.id) resetForm()
      await loadProviders()
    } catch (reason) {
      setError(getAdminErrorMessage(reason))
    }
  }

  return (
    <section className="manage-section">
      <div className="section-heading">
        <div>
          <h1>AIGC 配置</h1>
          <p>维护可用的模型供应商目录。API Key 仍由服务端凭据配置管理。</p>
        </div>
        <Link className="manage-link" to="/aigc">
          打开 AI 工作台
        </Link>
      </div>

      {error ? (
        <div className="manage-error-state">
          <p role="alert">{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadProviders()}
            disabled={loading}
          >
            重试
          </Button>
        </div>
      ) : null}

      <form className="manage-provider-form" onSubmit={submit}>
        <div className="manage-provider-form-grid">
          <SwInput
            label="供应商 ID"
            value={form.id}
            onValueChange={(id) => setForm((current) => ({ ...current, id }))}
            placeholder="例如 deepseek"
            disabled={Boolean(editingId) || saving}
            required
          />
          <SwInput
            label="显示名称"
            value={form.name}
            onValueChange={(name) =>
              setForm((current) => ({ ...current, name }))
            }
            placeholder="例如 DeepSeek"
            disabled={saving}
            required
          />
          <SwInput
            label="默认 Base URL"
            value={form.default_base_url ?? ''}
            onValueChange={(default_base_url) =>
              setForm((current) => ({ ...current, default_base_url }))
            }
            placeholder="https://api.example.com"
            disabled={saving}
            required
          />
          <SwInput
            label="默认模型"
            value={form.default_model ?? ''}
            onValueChange={(default_model) =>
              setForm((current) => ({ ...current, default_model }))
            }
            placeholder="例如 deepseek-chat"
            disabled={saving}
            required
          />
          <SwInput
            label="排序"
            type="number"
            value={String(form.sort_order)}
            onValueChange={(value) =>
              setForm((current) => ({
                ...current,
                sort_order: Number(value) || 0,
              }))
            }
            disabled={saving}
            min={0}
          />
          <SwSelect
            label="状态"
            value={form.is_enabled ? 'enabled' : 'disabled'}
            onValueChange={(value) =>
              setForm((current) => ({
                ...current,
                is_enabled: value === 'enabled',
              }))
            }
            options={[
              { value: 'enabled', label: '启用' },
              { value: 'disabled', label: '停用' },
            ]}
            disabled={saving}
          />
        </div>
        <div className="manage-provider-form-actions">
          <Button type="submit" disabled={saving}>
            {saving ? '保存中…' : editingId ? '更新供应商' : '添加供应商'}
          </Button>
          {editingId ? (
            <Button
              type="button"
              variant="outline"
              onClick={resetForm}
              disabled={saving}
            >
              取消编辑
            </Button>
          ) : null}
        </div>
      </form>

      <div className="table-scroll">
        <table className="manage-table">
          <thead>
            <tr>
              <th>供应商</th>
              <th>默认模型</th>
              <th>Base URL</th>
              <th>状态</th>
              <th>排序</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>加载中…</td>
              </tr>
            ) : providers.length === 0 ? (
              <tr>
                <td colSpan={6}>暂无目录配置，将使用服务端内置供应商。</td>
              </tr>
            ) : (
              providers.map((provider) => (
                <tr key={provider.id}>
                  <td>
                    <strong>{provider.name}</strong>
                    <small className="manage-provider-id">{provider.id}</small>
                  </td>
                  <td>{provider.default_model}</td>
                  <td>{provider.default_base_url}</td>
                  <td>{provider.is_enabled ? '启用' : '停用'}</td>
                  <td>{provider.sort_order}</td>
                  <td>
                    <div className="manage-table-actions">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => editProvider(provider)}
                      >
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void removeProvider(provider)}
                      >
                        删除
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
