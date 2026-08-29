import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button } from '@sun-world/base-ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sun-world/base-ui/dialog'
import { Input } from '@sun-world/base-ui/input'
import { Label } from '@sun-world/base-ui/label'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sun-world/base-ui/tabs'
import { Textarea } from '@sun-world/base-ui/textarea'
import { SunIcon } from '@sun-world/icons/react'

import type { AiPersona, AiSkill } from '../api'
import {
  MAX_SELECTED_AI_SKILLS,
  type AiCapabilityStatus,
  type AiPersonaDraft,
  type AiSkillDraft,
} from '../composables/useAiChat'

type CapabilityKind = 'persona' | 'skill'

interface EditorState {
  kind: CapabilityKind
  id?: string
  name: string
  description: string
  instructions: string
}

interface DeleteTarget {
  kind: CapabilityKind
  id: string
  name: string
}

export interface AiCapabilitySettingsProps {
  isAuthenticated: boolean
  status: AiCapabilityStatus
  error: string | null
  personas: AiPersona[]
  skills: AiSkill[]
  selectedPersonaId: string | null
  selectedSkillIds: string[]
  onSelectPersona: (personaId: string | null) => void
  onToggleSkill: (skillId: string) => void
  onRefresh: () => void | Promise<void>
  onSavePersona: (draft: AiPersonaDraft) => Promise<AiPersona>
  onDeletePersona: (personaId: string) => Promise<void>
  onSaveSkill: (draft: AiSkillDraft) => Promise<AiSkill>
  onDeleteSkill: (skillId: string) => Promise<void>
}

export function AiCapabilitySettings({
  isAuthenticated,
  status,
  error,
  personas,
  skills,
  selectedPersonaId,
  selectedSkillIds,
  onSelectPersona,
  onToggleSkill,
  onRefresh,
  onSavePersona,
  onDeletePersona,
  onSaveSkill,
  onDeleteSkill,
}: AiCapabilitySettingsProps) {
  const [open, setOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<CapabilityKind>('persona')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const selectedPersona = useMemo(
    () => personas.find((persona) => persona.id === selectedPersonaId),
    [personas, selectedPersonaId]
  )
  const summary = isAuthenticated
    ? `${selectedPersona?.name ?? '默认角色'} · ${selectedSkillIds.length} 个 Skill`
    : '登录后可用'

  useEffect(() => {
    if (open) return
    setEditor(null)
    setDeleteTarget(null)
    setActionError(null)
    setIsSaving(false)
    setIsDeleting(false)
  }, [open])

  const startCreate = (kind: CapabilityKind) => {
    setActiveTab(kind)
    setDeleteTarget(null)
    setActionError(null)
    setEditor({ kind, name: '', description: '', instructions: '' })
  }

  const startEdit = (kind: CapabilityKind, item: AiPersona | AiSkill) => {
    setActiveTab(kind)
    setDeleteTarget(null)
    setActionError(null)
    setEditor({
      kind,
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      instructions: item.instructions,
    })
  }

  const submitEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editor) return
    setActionError(null)
    setIsSaving(true)
    try {
      if (editor.kind === 'persona') {
        await onSavePersona({
          id: editor.id,
          name: editor.name.trim(),
          description: editor.description.trim() || null,
          instructions: editor.instructions.trim(),
        })
      } else {
        await onSaveSkill({
          id: editor.id,
          name: editor.name.trim(),
          description: editor.description.trim() || null,
          instructions: editor.instructions.trim(),
          kind: 'prompt',
        })
      }
      setEditor(null)
    } catch (reason) {
      setActionError(errorMessage(reason, '保存失败，请重试。'))
    } finally {
      setIsSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setActionError(null)
    setIsDeleting(true)
    try {
      if (deleteTarget.kind === 'persona') {
        await onDeletePersona(deleteTarget.id)
      } else {
        await onDeleteSkill(deleteTarget.id)
      }
      setDeleteTarget(null)
    } catch (reason) {
      setActionError(errorMessage(reason, '删除失败，请重试。'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="sw-ai-capability-trigger"
        aria-label={`角色与 Skills 设置：${summary}`}
        onClick={() => setOpen(true)}
      >
        <SunIcon name="user" />
        <span>角色与 Skills</span>
        <small>{summary}</small>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="sw-ai-capability-dialog"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>角色与提示词 Skills</DialogTitle>
            <DialogDescription>
              角色决定回答方式，Skills 叠加具体偏好。两者都只是服务端拼接的
              Markdown 提示词，不会作为脚本、插件或可执行代码运行。
            </DialogDescription>
          </DialogHeader>

          {!isAuthenticated ? (
            <GuestCapabilityState onClose={() => setOpen(false)} />
          ) : status === 'loading' ? (
            <div className="sw-ai-capability-state" role="status">
              <SunIcon name="loader" aria-hidden="true" />
              <p>正在加载你的角色与 Skills…</p>
            </div>
          ) : status === 'error' ? (
            <div className="sw-ai-capability-state" role="alert">
              <p>{error ?? '角色与 Skills 加载失败，请重试。'}</p>
              <Button type="button" variant="outline" onClick={onRefresh}>
                <SunIcon name="refresh-cw" />
                重新加载
              </Button>
            </div>
          ) : editor ? (
            <CapabilityEditor
              editor={editor}
              isSaving={isSaving}
              error={actionError}
              onChange={setEditor}
              onCancel={() => {
                setEditor(null)
                setActionError(null)
              }}
              onSubmit={submitEditor}
            />
          ) : (
            <>
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as CapabilityKind)}
                className="sw-ai-capability-tabs"
              >
                <TabsList aria-label="AI 配置类型">
                  <TabsTrigger value="persona">角色</TabsTrigger>
                  <TabsTrigger value="skill">
                    Skills ({selectedSkillIds.length}/{MAX_SELECTED_AI_SKILLS})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="persona">
                  <CapabilitySectionHeader
                    title="本次对话使用的角色"
                    actionLabel="新建角色"
                    onCreate={() => startCreate('persona')}
                  />
                  <div className="sw-ai-capability-list">
                    <Label
                      className="sw-ai-capability-option"
                      data-selected={selectedPersonaId === null || undefined}
                    >
                      <Input
                        className="sw-ai-capability-toggle"
                        type="radio"
                        name="ai-persona"
                        checked={selectedPersonaId === null}
                        onChange={() => onSelectPersona(null)}
                      />
                      <span>
                        <strong>默认助手</strong>
                        <small>不追加自定义角色提示词</small>
                      </span>
                    </Label>
                    {personas.map((persona) => (
                      <article
                        className="sw-ai-capability-card"
                        data-selected={
                          selectedPersonaId === persona.id || undefined
                        }
                        key={persona.id}
                      >
                        <Label className="sw-ai-capability-label">
                          <Input
                            className="sw-ai-capability-toggle"
                            type="radio"
                            name="ai-persona"
                            checked={selectedPersonaId === persona.id}
                            onChange={() => onSelectPersona(persona.id)}
                          />
                          <span>
                            <strong>{persona.name}</strong>
                            <small>
                              {persona.description || '自定义回答角色'}
                            </small>
                          </span>
                        </Label>
                        <CapabilityActions
                          kind="角色"
                          name={persona.name}
                          onEdit={() => startEdit('persona', persona)}
                          onDelete={() =>
                            setDeleteTarget({
                              kind: 'persona',
                              id: persona.id,
                              name: persona.name,
                            })
                          }
                        />
                      </article>
                    ))}
                    {!personas.length ? (
                      <p className="sw-ai-capability-empty">
                        还没有自定义角色，可以从一个清晰的回答风格开始。
                      </p>
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent value="skill">
                  <CapabilitySectionHeader
                    title={`选择最多 ${MAX_SELECTED_AI_SKILLS} 个提示词 Skill`}
                    actionLabel="新建 Skill"
                    onCreate={() => startCreate('skill')}
                  />
                  <p className="sw-ai-capability-note">
                    Skill 只保存声明式 Markdown
                    提示词，不接收脚本、命令、工具配置或可执行文件。
                  </p>
                  <div className="sw-ai-capability-list">
                    {skills.map((skill) => {
                      const selected = selectedSkillIds.includes(skill.id)
                      const limitReached =
                        !selected &&
                        selectedSkillIds.length >= MAX_SELECTED_AI_SKILLS
                      return (
                        <article
                          className="sw-ai-capability-card"
                          data-selected={selected || undefined}
                          key={skill.id}
                        >
                          <Label
                            className="sw-ai-capability-label"
                            title={
                              limitReached
                                ? `最多选择 ${MAX_SELECTED_AI_SKILLS} 个 Skill`
                                : undefined
                            }
                          >
                            <Input
                              className="sw-ai-capability-toggle"
                              type="checkbox"
                              checked={selected}
                              disabled={limitReached}
                              onChange={() => onToggleSkill(skill.id)}
                            />
                            <span>
                              <strong>{skill.name}</strong>
                              <small>
                                {skill.description || '纯提示词 Skill'}
                              </small>
                            </span>
                          </Label>
                          <CapabilityActions
                            kind="Skill"
                            name={skill.name}
                            onEdit={() => startEdit('skill', skill)}
                            onDelete={() =>
                              setDeleteTarget({
                                kind: 'skill',
                                id: skill.id,
                                name: skill.name,
                              })
                            }
                          />
                        </article>
                      )
                    })}
                    {!skills.length ? (
                      <p className="sw-ai-capability-empty">
                        还没有
                        Skill。可以添加“先给结论”或“输出检查清单”等纯提示词偏好。
                      </p>
                    ) : null}
                  </div>
                </TabsContent>
              </Tabs>

              {deleteTarget ? (
                <div className="sw-ai-delete-confirm" role="alert">
                  <p>
                    确认删除
                    {deleteTarget.kind === 'persona' ? '角色' : ' Skill'}“
                    {deleteTarget.name}”？删除后无法恢复。
                  </p>
                  <div>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isDeleting}
                      onClick={() => setDeleteTarget(null)}
                    >
                      取消
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isDeleting}
                      onClick={confirmDelete}
                    >
                      <SunIcon name="trash" />
                      {isDeleting ? '删除中…' : '确认删除'}
                    </Button>
                  </div>
                </div>
              ) : null}
              {actionError ? <p role="alert">{actionError}</p> : null}
            </>
          )}

          <div className="sw-ai-capability-footer">
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving || isDeleting}
              onClick={() => setOpen(false)}
            >
              完成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function GuestCapabilityState({ onClose }: { onClose: () => void }) {
  return (
    <div className="sw-ai-capability-state sw-ai-capability-state--guest">
      <SunIcon name="user" aria-hidden="true" />
      <div>
        <strong>登录后保存你的角色与 Skills</strong>
        <p>当前仍可直接聊天；登录只用于跨设备同步这些个人配置。</p>
      </div>
      <a
        className="sw-ai-capability-login"
        href="/login?return_to=%2Faigc"
        onClick={onClose}
      >
        去登录
      </a>
    </div>
  )
}

function CapabilitySectionHeader({
  title,
  actionLabel,
  onCreate,
}: {
  title: string
  actionLabel: string
  onCreate: () => void
}) {
  return (
    <div className="sw-ai-capability-section-head">
      <h3>{title}</h3>
      <Button type="button" variant="outline" size="sm" onClick={onCreate}>
        <SunIcon name="plus" />
        {actionLabel}
      </Button>
    </div>
  )
}

function CapabilityActions({
  kind,
  name,
  onEdit,
  onDelete,
}: {
  kind: string
  name: string
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div className="sw-ai-capability-actions">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`编辑${kind} ${name}`}
        onClick={onEdit}
      >
        <SunIcon name="edit" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`删除${kind} ${name}`}
        onClick={onDelete}
      >
        <SunIcon name="trash" />
      </Button>
    </div>
  )
}

function CapabilityEditor({
  editor,
  isSaving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  editor: EditorState
  isSaving: boolean
  error: string | null
  onChange: (editor: EditorState) => void
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const noun = editor.kind === 'persona' ? '角色' : 'Skill'
  const formPrefix = `ai-${editor.kind}-editor`
  return (
    <form
      className="sw-ai-capability-editor"
      aria-label={`${editor.id ? '编辑' : '新建'}${noun}`}
      onSubmit={onSubmit}
    >
      <div>
        <h3>{editor.id ? `编辑${noun}` : `新建${noun}`}</h3>
        <p>
          {editor.kind === 'persona'
            ? '描述希望 AI 采用的身份、语气与回答边界。'
            : '只填写声明式提示词；内容会作为文本参与提示词组合，不会被执行。'}
        </p>
      </div>
      <div className="sw-ai-capability-field">
        <Label htmlFor={`${formPrefix}-name`}>名称</Label>
        <Input
          id={`${formPrefix}-name`}
          value={editor.name}
          maxLength={120}
          required
          autoFocus
          disabled={isSaving}
          onChange={(event) =>
            onChange({ ...editor, name: event.currentTarget.value })
          }
        />
      </div>
      <div className="sw-ai-capability-field">
        <Label htmlFor={`${formPrefix}-description`}>简短说明（可选）</Label>
        <Input
          id={`${formPrefix}-description`}
          value={editor.description}
          maxLength={1000}
          disabled={isSaving}
          onChange={(event) =>
            onChange({ ...editor, description: event.currentTarget.value })
          }
        />
      </div>
      <div className="sw-ai-capability-field">
        <Label htmlFor={`${formPrefix}-instructions`}>提示词指令</Label>
        <Textarea
          id={`${formPrefix}-instructions`}
          value={editor.instructions}
          rows={9}
          maxLength={8000}
          required
          disabled={isSaving}
          aria-describedby={`${formPrefix}-instructions-help`}
          onChange={(event) =>
            onChange({ ...editor, instructions: event.currentTarget.value })
          }
        />
        <small id={`${formPrefix}-instructions-help`}>
          支持 Markdown，最多 8000 字；不接受或运行脚本、命令与可执行代码。
        </small>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <div className="sw-ai-capability-editor-actions">
        <Button
          type="button"
          variant="ghost"
          disabled={isSaving}
          onClick={onCancel}
        >
          返回
        </Button>
        <Button type="submit" disabled={isSaving}>
          <SunIcon name={isSaving ? 'loader' : 'check'} />
          {isSaving ? '保存中…' : `保存${noun}`}
        </Button>
      </div>
    </form>
  )
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}
