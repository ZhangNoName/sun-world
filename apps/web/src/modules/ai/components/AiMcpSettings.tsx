import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Checkbox } from '@sun-world/base-ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sun-world/base-ui/dialog'
import { Input } from '@sun-world/base-ui/input'
import { Label } from '@sun-world/base-ui/label'
import { Textarea } from '@sun-world/base-ui/textarea'
import { SunIcon } from '@sun-world/icons/react'
import { SwButton as Button } from '@sun-world/ui/sw-button'

import {
  callAiMcpTool,
  createAiMcpConnection,
  deleteAiMcpConnection,
  discoverAiMcpConnection,
  fetchAiMcpConnections,
  fetchAiMcpTools,
  updateAiMcpConnection,
  type AiMcpConnection,
  type AiMcpTool,
  type AiMcpToolCallResult,
} from '../api'

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface ConnectionEditorState {
  id?: string
  name: string
  endpoint: string
  bearerToken: string
  hasBearerToken: boolean
  clearBearerToken: boolean
  enabled: boolean
}

interface ToolCallState {
  connection: AiMcpConnection
  tool: AiMcpTool
  argumentsText: string
  confirmed: boolean
}

export interface AiMcpSettingsProps {
  isAuthenticated: boolean
  accountKey?: string | number | null
}

export function AiMcpSettings({
  isAuthenticated,
  accountKey,
}: AiMcpSettingsProps) {
  const [open, setOpen] = useState(false)
  const [connections, setConnections] = useState<AiMcpConnection[]>([])
  const [connectionStatus, setConnectionStatus] = useState<LoadStatus>('idle')
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    null
  )
  const [tools, setTools] = useState<AiMcpTool[]>([])
  const [toolStatus, setToolStatus] = useState<LoadStatus>('idle')
  const [editor, setEditor] = useState<ConnectionEditorState | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AiMcpConnection | null>(null)
  const [toolCall, setToolCall] = useState<ToolCallState | null>(null)
  const [callResult, setCallResult] = useState<AiMcpToolCallResult | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const connectionGeneration = useRef(0)
  const toolGeneration = useRef(0)
  const accountGeneration = useRef(0)
  const resolvedAccountKey =
    accountKey === undefined
      ? isAuthenticated
        ? 'authenticated'
        : null
      : accountKey

  const refreshConnections = useCallback(async () => {
    const generation = ++connectionGeneration.current
    setConnectionStatus('loading')
    setConnectionError(null)
    try {
      const items = await fetchAiMcpConnections()
      if (connectionGeneration.current !== generation) return
      setConnections(items ?? [])
      setActiveConnectionId((current) =>
        current && items?.some((item) => item.id === current) ? current : null
      )
      setConnectionStatus('ready')
    } catch (reason) {
      if (connectionGeneration.current !== generation) return
      setConnectionStatus('error')
      setConnectionError(errorMessage(reason, 'MCP 连接加载失败，请重试。'))
    }
  }, [])

  const loadTools = useCallback(async (connectionId: string) => {
    const generation = ++toolGeneration.current
    setActiveConnectionId(connectionId)
    setToolStatus('loading')
    setTools([])
    setActionError(null)
    setToolCall(null)
    setCallResult(null)
    try {
      const items = await fetchAiMcpTools(connectionId)
      if (toolGeneration.current !== generation) return
      setTools(items ?? [])
      setToolStatus('ready')
    } catch (reason) {
      if (toolGeneration.current !== generation) return
      setToolStatus('error')
      setActionError(errorMessage(reason, 'MCP 工具加载失败，请重试。'))
    }
  }, [])

  useEffect(() => {
    ++accountGeneration.current
    ++connectionGeneration.current
    ++toolGeneration.current
    setConnections([])
    setConnectionStatus('idle')
    setActiveConnectionId(null)
    setTools([])
    setToolStatus('idle')
    setEditor(null)
    setDeleteTarget(null)
    setToolCall(null)
    setCallResult(null)
    setConnectionError(null)
    setActionError(null)
    setPendingAction(null)
  }, [resolvedAccountKey])

  useEffect(() => {
    if (!open || !isAuthenticated || resolvedAccountKey === null) return
    void refreshConnections()
  }, [isAuthenticated, open, refreshConnections, resolvedAccountKey])

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (nextOpen) return
    ++accountGeneration.current
    ++connectionGeneration.current
    ++toolGeneration.current
    setEditor(null)
    setDeleteTarget(null)
    setToolCall(null)
    setCallResult(null)
    setActionError(null)
    setPendingAction(null)
  }

  const startCreate = () => {
    setDeleteTarget(null)
    setToolCall(null)
    setCallResult(null)
    setActionError(null)
    setEditor({
      name: '',
      endpoint: '',
      bearerToken: '',
      hasBearerToken: false,
      clearBearerToken: false,
      enabled: true,
    })
  }

  const startEdit = (connection: AiMcpConnection) => {
    setDeleteTarget(null)
    setToolCall(null)
    setCallResult(null)
    setActionError(null)
    setEditor({
      id: connection.id,
      name: connection.name,
      endpoint: connection.endpoint,
      bearerToken: '',
      hasBearerToken: connection.has_bearer_token,
      clearBearerToken: false,
      enabled: connection.enabled,
    })
  }

  const saveConnection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editor) return
    const endpointError = validateMcpEndpoint(editor.endpoint)
    if (endpointError) {
      setActionError(endpointError)
      return
    }
    setPendingAction('save')
    setActionError(null)
    const generation = accountGeneration.current
    const bearerToken = editor.bearerToken.trim()
    try {
      if (editor.id) {
        await updateAiMcpConnection(editor.id, {
          name: editor.name.trim(),
          endpoint: editor.endpoint.trim(),
          bearer_token: bearerToken || undefined,
          clear_bearer_token: bearerToken ? false : editor.clearBearerToken,
          enabled: editor.enabled,
        })
      } else {
        await createAiMcpConnection({
          name: editor.name.trim(),
          endpoint: editor.endpoint.trim(),
          bearer_token: bearerToken || undefined,
          enabled: editor.enabled,
        })
      }
      if (accountGeneration.current !== generation) return
      setEditor(null)
      await refreshConnections()
    } catch (reason) {
      if (accountGeneration.current !== generation) return
      setActionError(errorMessage(reason, 'MCP 连接保存失败，请重试。'))
    } finally {
      if (accountGeneration.current === generation) setPendingAction(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setPendingAction(`delete:${deleteTarget.id}`)
    setActionError(null)
    const generation = accountGeneration.current
    try {
      await deleteAiMcpConnection(deleteTarget.id)
      if (accountGeneration.current !== generation) return
      if (activeConnectionId === deleteTarget.id) {
        ++toolGeneration.current
        setActiveConnectionId(null)
        setTools([])
        setToolStatus('idle')
      }
      setDeleteTarget(null)
      await refreshConnections()
    } catch (reason) {
      if (accountGeneration.current !== generation) return
      setActionError(errorMessage(reason, 'MCP 连接删除失败，请重试。'))
    } finally {
      if (accountGeneration.current === generation) setPendingAction(null)
    }
  }

  const discoverConnection = async (connection: AiMcpConnection) => {
    setPendingAction(`discover:${connection.id}`)
    setActionError(null)
    const generation = accountGeneration.current
    try {
      await discoverAiMcpConnection(connection.id)
      if (accountGeneration.current !== generation) return
      await Promise.all([refreshConnections(), loadTools(connection.id)])
    } catch (reason) {
      if (accountGeneration.current !== generation) return
      setActionError(errorMessage(reason, '工具发现失败，请检查连接配置。'))
    } finally {
      if (accountGeneration.current === generation) setPendingAction(null)
    }
  }

  const submitToolCall = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!toolCall || !toolCall.confirmed) return
    let argumentsValue: Record<string, unknown>
    try {
      argumentsValue = parseToolArguments(toolCall.argumentsText)
    } catch (reason) {
      setActionError(errorMessage(reason, '参数必须是 JSON 对象。'))
      return
    }
    setPendingAction('call')
    setActionError(null)
    setCallResult(null)
    const generation = accountGeneration.current
    try {
      const result = await callAiMcpTool(
        toolCall.connection.id,
        toolCall.tool.name,
        argumentsValue
      )
      if (accountGeneration.current !== generation) return
      setCallResult(result)
      setToolCall((current) =>
        current ? { ...current, confirmed: false } : current
      )
    } catch (reason) {
      if (accountGeneration.current !== generation) return
      setActionError(errorMessage(reason, 'MCP 工具调用失败，请重试。'))
    } finally {
      if (accountGeneration.current === generation) setPendingAction(null)
    }
  }

  const activeConnection = connections.find(
    (connection) => connection.id === activeConnectionId
  )
  const summary = !isAuthenticated
    ? '0 个连接'
    : connectionStatus === 'ready'
      ? `${connections.length} 个连接`
      : '远程工具'

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="sw-ai-capability-trigger sw-ai-mcp-trigger"
        aria-label={`MCP 设置：${summary}`}
        onClick={() => setOpen(true)}
      >
        <SunIcon name="settings" />
        <span>MCP</span>
        <small>{summary}</small>
      </Button>

      <Dialog open={open} onOpenChange={changeOpen}>
        <DialogContent className="sw-ai-capability-dialog sw-ai-mcp-dialog">
          <DialogHeader>
            <DialogTitle>MCP 远程工具</DialogTitle>
            <DialogDescription>
              管理 HTTPS Streamable HTTP 连接并手动调用工具。工具不会自动暴露给
              AI；每次远程调用都必须由你在这里明确确认。
            </DialogDescription>
          </DialogHeader>

          {!isAuthenticated ? (
            <GuestMcpState onClose={() => changeOpen(false)} />
          ) : editor ? (
            <ConnectionEditor
              editor={editor}
              tokenHint={
                editor.id
                  ? connections.find((item) => item.id === editor.id)
                      ?.bearer_token_hint
                  : null
              }
              isSaving={pendingAction === 'save'}
              error={actionError}
              onChange={setEditor}
              onCancel={() => {
                setEditor(null)
                setActionError(null)
              }}
              onSubmit={saveConnection}
            />
          ) : toolCall ? (
            <ToolCallEditor
              state={toolCall}
              result={callResult}
              error={actionError}
              isCalling={pendingAction === 'call'}
              onChange={setToolCall}
              onBack={() => {
                setToolCall(null)
                setCallResult(null)
                setActionError(null)
              }}
              onSubmit={submitToolCall}
            />
          ) : connectionStatus === 'loading' ? (
            <LoadingState label="正在加载 MCP 连接…" />
          ) : connectionStatus === 'error' ? (
            <ErrorState
              message={connectionError ?? 'MCP 连接加载失败，请重试。'}
              onRetry={refreshConnections}
            />
          ) : (
            <div className="sw-ai-mcp-workspace">
              <section className="sw-ai-mcp-connections">
                <CapabilityHeader
                  title="我的连接"
                  actionLabel="新建连接"
                  onAction={startCreate}
                />
                <p className="sw-ai-capability-note">
                  仅接受 HTTPS 地址。Bearer Token
                  加密保存，之后只显示掩码，不会回显原文。
                </p>
                <div className="sw-ai-capability-list">
                  {connections.map((connection) => (
                    <ConnectionCard
                      key={connection.id}
                      connection={connection}
                      selected={activeConnectionId === connection.id}
                      isBusy={Boolean(pendingAction)}
                      isDiscovering={
                        pendingAction === `discover:${connection.id}`
                      }
                      onSelect={() => void loadTools(connection.id)}
                      onDiscover={() => void discoverConnection(connection)}
                      onEdit={() => startEdit(connection)}
                      onDelete={() => {
                        setActionError(null)
                        setDeleteTarget(connection)
                      }}
                    />
                  ))}
                  {!connections.length ? (
                    <p className="sw-ai-capability-empty">
                      还没有 MCP 连接。添加服务地址后，再主动发现它公开的工具。
                    </p>
                  ) : null}
                </div>

                {deleteTarget ? (
                  <div className="sw-ai-delete-confirm" role="alert">
                    <p>
                      确认删除连接“{deleteTarget.name}
                      ”？已发现的工具记录也会被移除。
                    </p>
                    <div>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={Boolean(pendingAction)}
                        onClick={() => setDeleteTarget(null)}
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={Boolean(pendingAction)}
                        onClick={() => void confirmDelete()}
                      >
                        <SunIcon name="trash" />
                        {pendingAction === `delete:${deleteTarget.id}`
                          ? '删除中…'
                          : '确认删除'}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>

              <ToolList
                connection={activeConnection}
                tools={tools}
                status={toolStatus}
                isBusy={Boolean(pendingAction)}
                onRetry={() => {
                  if (activeConnection) void loadTools(activeConnection.id)
                }}
                onCall={(tool) => {
                  if (!activeConnection) return
                  setActionError(null)
                  setCallResult(null)
                  setToolCall({
                    connection: activeConnection,
                    tool,
                    argumentsText: '{}',
                    confirmed: false,
                  })
                }}
              />

              {actionError ? <p role="alert">{actionError}</p> : null}
            </div>
          )}

          <div className="sw-ai-capability-footer">
            <Button
              type="button"
              variant="ghost"
              disabled={Boolean(pendingAction)}
              onClick={() => changeOpen(false)}
            >
              完成
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function GuestMcpState({ onClose }: { onClose: () => void }) {
  return (
    <div className="sw-ai-capability-state sw-ai-capability-state--guest">
      <SunIcon name="settings" aria-hidden="true" />
      <div>
        <strong>当前没有 MCP 连接</strong>
        <p>远程工具会显示在这里；登录后可添加并同步你的连接。</p>
      </div>
      <a
        className="sw-ai-capability-login"
        href="/login?return_to=%2Faigc"
        onClick={onClose}
      >
        登录后添加
      </a>
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="sw-ai-capability-state" role="status">
      <SunIcon name="loader" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void | Promise<void>
}) {
  return (
    <div className="sw-ai-capability-state" role="alert">
      <p>{message}</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        <SunIcon name="refresh-cw" />
        重新加载
      </Button>
    </div>
  )
}

function CapabilityHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="sw-ai-capability-section-head">
      <h3>{title}</h3>
      <Button type="button" variant="outline" size="sm" onClick={onAction}>
        <SunIcon name="plus" />
        {actionLabel}
      </Button>
    </div>
  )
}

function ConnectionCard({
  connection,
  selected,
  isBusy,
  isDiscovering,
  onSelect,
  onDiscover,
  onEdit,
  onDelete,
}: {
  connection: AiMcpConnection
  selected: boolean
  isBusy: boolean
  isDiscovering: boolean
  onSelect: () => void
  onDiscover: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <article
      className="sw-ai-capability-card sw-ai-mcp-connection-card"
      data-selected={selected || undefined}
    >
      <Button
        type="button"
        variant="ghost"
        className="sw-ai-mcp-card-main"
        disabled={isBusy}
        aria-label={`查看 ${connection.name} 的工具`}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <span>
          <strong>{connection.name}</strong>
          <small>{connection.endpoint}</small>
        </span>
        <span className="sw-ai-mcp-badges" aria-label="连接状态">
          <small data-enabled={connection.enabled || undefined}>
            {connection.enabled ? '已启用' : '已停用'}
          </small>
          {connection.has_bearer_token ? <small>Token 已保存</small> : null}
        </span>
      </Button>
      <div className="sw-ai-capability-actions sw-ai-mcp-card-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!connection.enabled || isBusy}
          aria-label={`发现工具 ${connection.name}`}
          onClick={onDiscover}
        >
          <SunIcon name={isDiscovering ? 'loader' : 'refresh-cw'} />
          {isDiscovering ? '发现中…' : '发现'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isBusy}
          aria-label={`编辑 MCP 连接 ${connection.name}`}
          onClick={onEdit}
        >
          <SunIcon name="edit" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isBusy}
          aria-label={`删除 MCP 连接 ${connection.name}`}
          onClick={onDelete}
        >
          <SunIcon name="trash" />
        </Button>
      </div>
      <small className="sw-ai-mcp-discovery-time">
        {connection.last_discovered_at
          ? `上次发现：${formatDateTime(connection.last_discovered_at)}`
          : '尚未发现工具'}
      </small>
    </article>
  )
}

function ToolList({
  connection,
  tools,
  status,
  isBusy,
  onRetry,
  onCall,
}: {
  connection: AiMcpConnection | undefined
  tools: AiMcpTool[]
  status: LoadStatus
  isBusy: boolean
  onRetry: () => void
  onCall: (tool: AiMcpTool) => void
}) {
  return (
    <section className="sw-ai-mcp-tools" aria-label="已发现的 MCP 工具">
      <div className="sw-ai-capability-section-head">
        <h3>{connection ? `${connection.name} 的工具` : '已发现的工具'}</h3>
      </div>
      {!connection ? (
        <p className="sw-ai-capability-empty">
          选择一个连接，查看已发现的工具。
        </p>
      ) : status === 'loading' ? (
        <LoadingState label="正在加载工具…" />
      ) : status === 'error' ? (
        <ErrorState message="工具加载失败，请重试。" onRetry={onRetry} />
      ) : tools.length ? (
        <div className="sw-ai-mcp-tool-list">
          {tools.map((tool) => (
            <article className="sw-ai-mcp-tool-card" key={tool.name}>
              <div>
                <strong>{tool.name}</strong>
                <p>{tool.description || '该工具未提供说明。'}</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!connection.enabled || isBusy}
                onClick={() => onCall(tool)}
              >
                <SunIcon name="arrow" />
                手动调用
              </Button>
            </article>
          ))}
        </div>
      ) : (
        <p className="sw-ai-capability-empty">
          暂无已发现工具。先点击连接上的“发现”。
        </p>
      )}
    </section>
  )
}

function ConnectionEditor({
  editor,
  tokenHint,
  isSaving,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  editor: ConnectionEditorState
  tokenHint: string | null | undefined
  isSaving: boolean
  error: string | null
  onChange: (editor: ConnectionEditorState) => void
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const prefix = useId()
  const clearTokenId = `${prefix}-clear-token`
  const enabledId = `${prefix}-enabled`
  return (
    <form
      className="sw-ai-capability-editor sw-ai-mcp-editor"
      aria-label={editor.id ? '编辑 MCP 连接' : '新建 MCP 连接'}
      onSubmit={onSubmit}
    >
      <div>
        <h3>{editor.id ? '编辑 MCP 连接' : '新建 MCP 连接'}</h3>
        <p>
          当前仅支持 HTTPS Streamable
          HTTP；服务地址中的账号、密码和片段会被拒绝。
        </p>
      </div>
      <div className="sw-ai-capability-field">
        <Label htmlFor={`${prefix}-name`}>连接名称</Label>
        <Input
          id={`${prefix}-name`}
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
        <Label htmlFor={`${prefix}-endpoint`}>HTTPS 服务地址</Label>
        <Input
          id={`${prefix}-endpoint`}
          type="url"
          inputMode="url"
          placeholder="https://mcp.example.com/mcp"
          value={editor.endpoint}
          maxLength={2048}
          required
          disabled={isSaving}
          onChange={(event) =>
            onChange({ ...editor, endpoint: event.currentTarget.value })
          }
        />
      </div>
      <div className="sw-ai-capability-field">
        <Label htmlFor={`${prefix}-token`}>
          Bearer Token（可选，保存后不回显）
        </Label>
        <Input
          id={`${prefix}-token`}
          type="password"
          autoComplete="new-password"
          value={editor.bearerToken}
          maxLength={4096}
          disabled={isSaving || editor.clearBearerToken}
          placeholder={
            editor.hasBearerToken ? '留空以保留现有 Token' : '输入服务访问令牌'
          }
          onChange={(event) =>
            onChange({
              ...editor,
              bearerToken: event.currentTarget.value,
              clearBearerToken: false,
            })
          }
        />
        {editor.hasBearerToken ? (
          <small>
            已保存 Token{tokenHint ? `（${tokenHint}）` : ''}
            ；原文不会从服务端返回。
          </small>
        ) : null}
      </div>
      {editor.hasBearerToken ? (
        <div className="sw-ai-mcp-check-row">
          <Checkbox
            id={clearTokenId}
            checked={editor.clearBearerToken}
            disabled={isSaving}
            onCheckedChange={(checked) =>
              onChange({
                ...editor,
                clearBearerToken: checked,
                bearerToken: checked ? '' : editor.bearerToken,
              })
            }
          />
          <Label htmlFor={clearTokenId}>清除已保存的 Bearer Token</Label>
        </div>
      ) : null}
      <div className="sw-ai-mcp-check-row">
        <Checkbox
          id={enabledId}
          checked={editor.enabled}
          disabled={isSaving}
          onCheckedChange={(checked) =>
            onChange({ ...editor, enabled: checked })
          }
        />
        <Label htmlFor={enabledId}>启用此连接</Label>
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
          {isSaving ? '保存中…' : '保存连接'}
        </Button>
      </div>
    </form>
  )
}

function ToolCallEditor({
  state,
  result,
  error,
  isCalling,
  onChange,
  onBack,
  onSubmit,
}: {
  state: ToolCallState
  result: AiMcpToolCallResult | null
  error: string | null
  isCalling: boolean
  onChange: (state: ToolCallState) => void
  onBack: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const confirmId = useId()
  return (
    <form
      className="sw-ai-capability-editor sw-ai-mcp-call-editor"
      aria-label={`手动调用 MCP 工具 ${state.tool.name}`}
      onSubmit={onSubmit}
    >
      <div>
        <h3>手动调用 {state.tool.name}</h3>
        <p>
          连接：{state.connection.name}。该操作会立即请求远程 MCP 服务，不会由
          AI 自动触发。
        </p>
      </div>
      {state.tool.description ? <p>{state.tool.description}</p> : null}
      <details className="sw-ai-mcp-schema">
        <summary>查看输入 Schema</summary>
        <pre>{formatJson(state.tool.input_schema)}</pre>
      </details>
      <div className="sw-ai-capability-field">
        <Label htmlFor="mcp-tool-arguments">调用参数（JSON 对象）</Label>
        <Textarea
          id="mcp-tool-arguments"
          value={state.argumentsText}
          rows={8}
          spellCheck={false}
          disabled={isCalling}
          onChange={(event) =>
            onChange({ ...state, argumentsText: event.currentTarget.value })
          }
        />
      </div>
      <div className="sw-ai-mcp-confirmation">
        <div className="sw-ai-mcp-check-row">
          <Checkbox
            id={confirmId}
            checked={state.confirmed}
            disabled={isCalling}
            onCheckedChange={(checked) =>
              onChange({ ...state, confirmed: checked })
            }
          />
          <Label htmlFor={confirmId}>
            我确认立即调用“{state.tool.name}”，并将上述参数发送到“
            {state.connection.name}”。
          </Label>
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {result ? (
        <section className="sw-ai-mcp-call-result" aria-live="polite">
          <h4>调用结果</h4>
          <pre>{formatJson(result.result)}</pre>
          <details>
            <summary>查看结果元数据</summary>
            <pre>{formatJson(result.result_metadata)}</pre>
          </details>
          <small>调用记录：{result.call_id}</small>
        </section>
      ) : null}
      <div className="sw-ai-capability-editor-actions">
        <Button
          type="button"
          variant="ghost"
          disabled={isCalling}
          onClick={onBack}
        >
          返回工具列表
        </Button>
        <Button type="submit" disabled={isCalling || !state.confirmed}>
          <SunIcon name={isCalling ? 'loader' : 'arrow'} />
          {isCalling ? '调用中…' : '确认并立即调用'}
        </Button>
      </div>
    </form>
  )
}

function validateMcpEndpoint(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:') return 'MCP 服务地址必须使用 HTTPS。'
    if (url.port && url.port !== '443')
      return 'MCP 服务地址只能使用默认的 443 端口。'
    if (url.username || url.password) return 'MCP 服务地址不能包含账号或密码。'
    if (url.hash) return 'MCP 服务地址不能包含 URL 片段。'
    return null
  } catch {
    return '请输入有效的 HTTPS MCP 服务地址。'
  }
}

function parseToolArguments(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value || '{}') as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('参数必须是 JSON 对象，不能是数组或基础值。')
  }
  return parsed as Record<string, unknown>
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date)
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback
}
