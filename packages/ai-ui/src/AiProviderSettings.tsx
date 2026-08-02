import { useEffect, useState, type FormEvent } from 'react'
import { SwButton as Button } from '@sun-world/ui/sw-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sun-world/base-ui/dialog'
import { SwInput } from '@sun-world/ui/sw-input'
import { SwSelect } from '@sun-world/ui/sw-select'

import type {
  AiProviderDraft,
  AiUiProvider,
  AiUiProviderProfile,
} from './types'

export function AiProviderSettings({
  open,
  providers,
  profiles,
  onOpenChange,
  onSave,
}: {
  open: boolean
  providers: AiUiProvider[]
  profiles: AiUiProviderProfile[]
  onOpenChange: (open: boolean) => void
  onSave?: (draft: AiProviderDraft) => void | Promise<void>
}) {
  const [provider, setProvider] = useState('')
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setApiKey('')
      setSaveError(null)
    }
  }, [open])

  useEffect(() => {
    const defaultProvider = providers[0]
    setProvider(defaultProvider?.id ?? '')
    setName(defaultProvider?.name ?? '')
    setBaseUrl(defaultProvider?.defaultBaseUrl ?? '')
    setModel(defaultProvider?.defaultModel ?? '')
  }, [providers])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onSave) {
      setSaveError('保存功能暂不可用，请稍后重试。')
      return
    }

    setIsSaving(true)
    setSaveError(null)
    try {
      await onSave({
        provider,
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: apiKey || undefined,
        isDefault: true,
      })
      setApiKey('')
      onOpenChange(false)
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : '保存失败，请重试。'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const changeProvider = (providerId: string) => {
    setProvider(providerId)
    const selected = providers.find((item) => item.id === providerId)
    if (!selected) return
    setName(selected.name)
    setBaseUrl(selected.defaultBaseUrl ?? '')
    setModel(selected.defaultModel ?? '')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sw-ai-settings" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>模型与服务商</DialogTitle>
          <DialogDescription>
            API Key 只在保存时发送，页面不会读取或缓存已有密钥。
          </DialogDescription>
        </DialogHeader>
        {profiles.length ? (
          <section className="sw-ai-profile-list" aria-label="已保存模型配置">
            {profiles.map((profile) => (
              <article key={profile.id}>
                <div>
                  <strong>{profile.name}</strong>
                  {profile.isDefault ? <span>默认</span> : null}
                </div>
                <p>{profile.model}</p>
                <small>
                  {profile.hasApiKey
                    ? (profile.apiKeyHint ?? '密钥已保存')
                    : '未保存个人密钥'}
                </small>
              </article>
            ))}
          </section>
        ) : null}
        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-4">
            <SwSelect
              label="服务商"
              options={providers.map((item) => ({
                value: item.id,
                label: item.name,
              }))}
              value={provider}
              onValueChange={changeProvider}
              surface="modal"
              disabled={isSaving}
            />
            <SwInput
              label="配置名称"
              value={name}
              onValueChange={setName}
              required
              disabled={isSaving}
            />
            <SwInput
              label="Base URL"
              value={baseUrl}
              onValueChange={setBaseUrl}
              type="url"
              required
              disabled={isSaving}
            />
            <SwInput
              label="模型"
              value={model}
              onValueChange={setModel}
              required
              disabled={isSaving}
            />
            <SwInput
              label="API Key"
              value={apiKey}
              onValueChange={setApiKey}
              type="password"
              autoComplete="off"
              disabled={isSaving}
            />
          </div>
          {saveError ? <p role="alert">{saveError}</p> : null}
          <div className="sw-ai-settings-actions">
            <Button
              type="button"
              variant="ghost"
              aria-label="关闭设置"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              取消
            </Button>
            <Button type="submit" loading={isSaving}>
              {isSaving ? '保存中…' : '保存配置'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
