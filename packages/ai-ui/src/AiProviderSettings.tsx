import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@sun-world/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sun-world/ui/dialog'
import { Input } from '@sun-world/ui/input'

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
  const defaultProvider = providers[0]
  const [provider, setProvider] = useState(defaultProvider?.id ?? 'deepseek')
  const [name, setName] = useState(defaultProvider?.name ?? 'DeepSeek')
  const [baseUrl, setBaseUrl] = useState(
    defaultProvider?.defaultBaseUrl ?? 'https://api.deepseek.com'
  )
  const [model, setModel] = useState(
    defaultProvider?.defaultModel ?? 'deepseek-chat'
  )
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    if (open) setApiKey('')
  }, [open])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void onSave?.({
      provider,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      model: model.trim(),
      apiKey: apiKey || undefined,
      isDefault: true,
    })
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
        <form onSubmit={submit}>
          <label>
            服务商
            <select
              value={provider}
              onChange={(event) => changeProvider(event.currentTarget.value)}
            >
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            配置名称
            <Input value={name} onValueChange={setName} required />
          </label>
          <label>
            Base URL
            <Input
              value={baseUrl}
              onValueChange={setBaseUrl}
              type="url"
              required
            />
          </label>
          <label>
            模型
            <Input value={model} onValueChange={setModel} required />
          </label>
          <label>
            API Key
            <Input
              value={apiKey}
              onValueChange={setApiKey}
              type="password"
              autoComplete="off"
            />
          </label>
          <div className="sw-ai-settings-actions">
            <Button
              type="button"
              variant="ghost"
              aria-label="关闭设置"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit">保存配置</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
