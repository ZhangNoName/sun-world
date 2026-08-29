import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@sun-world/base-ui/button'
import { SunIcon } from '@sun-world/icons/react'

import {
  getAccountConnections,
  getAuthMethods,
  startOAuthConnect,
} from '@/modules/account/api'
import {
  getAccountErrorMessage,
  isAccountStepUpError,
} from '@/modules/account/errors'
import type {
  AccountConnections,
  AuthMethod,
  OAuthProvider,
} from '@/modules/account/types'
import { useAuthStore } from '@/store/auth'
import { safeAuthReturnTo } from '@/pages/login/returnTo'

import { VerifiedContactLinker } from './VerifiedContactLinker'
import './me.css'

const providerLabels: Record<string, string> = {
  google: 'Google',
  qq: 'QQ',
  wechat: '微信',
}

const oauthProviders: Array<{
  id: OAuthProvider
  label: string
  mark: string
}> = [
  { id: 'google', label: 'Google', mark: 'G' },
  { id: 'qq', label: 'QQ', mark: 'QQ' },
  { id: 'wechat', label: '微信', mark: '微' },
]

const connectReturnTo = safeAuthReturnTo('/me?panel=connections', '/me')
const connectStepUpPath = `/login?return_to=${encodeURIComponent(connectReturnTo)}`

function providerLabel(provider: string) {
  return providerLabels[provider] ?? provider
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '时间未知'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date)
}

function safeAuthorizationUrl(value: string) {
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:') {
    throw new Error('第三方授权地址无效，请稍后重试。')
  }
  return parsed.href
}

export function MePage() {
  const navigate = useNavigate()
  const status = useAuthStore((state) => state.status)
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const [connections, setConnections] = useState<AccountConnections | null>(
    null
  )
  const [connectionsError, setConnectionsError] = useState('')
  const [isLoadingConnections, setIsLoadingConnections] = useState(false)
  const [oauthMethods, setOAuthMethods] = useState<AuthMethod[]>([])
  const [oauthLoading, setOAuthLoading] = useState<OAuthProvider | null>(null)
  const [oauthError, setOAuthError] = useState('')
  const [needsStepUp, setNeedsStepUp] = useState(false)
  const [isSteppingUp, setIsSteppingUp] = useState(false)

  const loadConnections = useCallback(async () => {
    setIsLoadingConnections(true)
    setConnectionsError('')
    try {
      setConnections(await getAccountConnections())
    } catch (error) {
      setConnectionsError(
        error instanceof Error ? error.message : '暂时无法读取账号连接'
      )
    } finally {
      setIsLoadingConnections(false)
    }
  }, [])

  useEffect(() => {
    if (status !== 'authenticated' || !user) {
      setConnections(null)
      setOAuthMethods([])
      return
    }
    let active = true
    void loadConnections()
    getAuthMethods()
      .then((methods) => {
        if (active)
          setOAuthMethods(methods.filter((method) => method.kind === 'oauth'))
      })
      .catch(() => {
        if (active) setOAuthMethods([])
      })
    return () => {
      active = false
    }
  }, [loadConnections, status, user])

  const startProviderConnect = async (provider: OAuthProvider) => {
    setOAuthError('')
    setNeedsStepUp(false)
    setOAuthLoading(provider)
    try {
      const start = await startOAuthConnect(provider, connectReturnTo)
      if (start.flow !== 'connect') {
        throw new Error('服务器未确认账号关联流程，请刷新页面后重试。')
      }
      window.location.assign(safeAuthorizationUrl(start.authorization_url))
    } catch (error) {
      setNeedsStepUp(isAccountStepUpError(error))
      setOAuthError(getAccountErrorMessage(error))
      setOAuthLoading(null)
    }
  }

  const restartAuthentication = async () => {
    setIsSteppingUp(true)
    try {
      await logout()
    } catch {
      // The auth store clears local session state even when remote logout fails.
    } finally {
      navigate(connectStepUpPath)
    }
  }

  if (status === 'unknown' || status === 'restoring') {
    return (
      <main className="me-page me-page--centered" aria-busy="true">
        <SunIcon className="me-page__spinner" name="loader" />
        <p>正在确认登录状态…</p>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="me-page me-page--centered">
        <section className="me-guest-card">
          <span className="me-eyebrow">可选账号</span>
          <SunIcon className="me-guest-card__icon" name="user" />
          <h1>不登录也能继续探索</h1>
          <p>
            登录后可跨设备同步 AI 对话、角色、Skill 和 MCP
            连接；公开内容与基础工具仍可直接使用。
          </p>
          <div className="me-guest-card__actions">
            <Link
              className="me-link-button me-link-button--primary"
              to="/login?return_to=/me"
            >
              登录或创建账号
            </Link>
            <Link className="me-link-button" to="/aigc">
              先体验 AI
            </Link>
          </div>
        </section>
      </main>
    )
  }

  const displayUser = user as typeof user & { avatar?: string }
  const identities = connections?.identities ?? []
  const contacts = connections?.contacts ?? []
  const connectedProviders = new Set(
    identities.map((identity) => identity.provider)
  )
  const oauthMethodById = new Map(
    oauthMethods.map((method) => [method.id, method])
  )

  return (
    <main className="me-page">
      <header className="me-hero">
        <img src={displayUser.avatar || '/avator.webp'} alt="头像" />
        <div>
          <span className="me-eyebrow">Sun World 账号</span>
          <h1>{user.name || 'Sun World 用户'}</h1>
          <p>你的登录方式与 AI 工作空间都归属于同一个账号。</p>
        </div>
        <Link className="me-link-button me-link-button--primary" to="/aigc">
          <SunIcon name="message-circle" />
          打开 AI 工作台
        </Link>
      </header>

      <div className="me-grid">
        <section className="me-card" aria-labelledby="verified-contacts-title">
          <div className="me-card__heading">
            <div>
              <span className="me-eyebrow">账户关联依据</span>
              <h2 id="verified-contacts-title">已验证联系方式</h2>
            </div>
            <SunIcon name="check" />
          </div>
          {isLoadingConnections ? (
            <p className="me-muted" aria-live="polite">
              正在读取…
            </p>
          ) : contacts.length > 0 ? (
            <ul className="me-connection-list">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <span className="me-connection-mark">
                    {contact.kind === 'phone' ? '手机' : '邮箱'}
                  </span>
                  <span>
                    <strong>{contact.value_hint}</strong>
                    <small>{formatDate(contact.verified_at)} 已验证</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="me-muted">尚无已验证的手机号或邮箱。</p>
          )}
          <p className="me-security-note">
            仅第三方明确返回的已验证手机号会触发自动关联；不会仅凭昵称或同名邮箱合并账号。
          </p>
          <VerifiedContactLinker onLinked={setConnections} />
        </section>

        <section className="me-card" aria-labelledby="linked-identities-title">
          <div className="me-card__heading">
            <div>
              <span className="me-eyebrow">登录方式</span>
              <h2 id="linked-identities-title">第三方连接</h2>
            </div>
            <SunIcon name="settings" />
          </div>
          {isLoadingConnections ? (
            <p className="me-muted" aria-live="polite">
              正在读取…
            </p>
          ) : identities.length > 0 ? (
            <ul className="me-connection-list">
              {identities.map((identity) => (
                <li key={identity.id}>
                  <span className="me-connection-mark me-connection-mark--provider">
                    {providerLabel(identity.provider).slice(0, 2)}
                  </span>
                  <span>
                    <strong>{providerLabel(identity.provider)}</strong>
                    <small>
                      {identity.display_name || '已连接'} · 最近登录{' '}
                      {formatDate(identity.last_authenticated_at)}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="me-muted">当前账号暂未连接第三方登录。</p>
          )}
          <div className="me-provider-connect">
            <div className="me-provider-connect__intro">
              <strong>连接新的登录方式</strong>
              <p>
                关联前会跳转到第三方再次确认身份；登录状态过期时需要先重新登录。
              </p>
            </div>
            <div
              className="me-provider-connect__actions"
              role="group"
              aria-label="连接第三方账号"
            >
              {oauthProviders.map((provider) => {
                const method = oauthMethodById.get(provider.id)
                const connected = connectedProviders.has(provider.id)
                const unavailableReason =
                  method?.reason ||
                  (!method ? '正在检查第三方登录可用性' : undefined)
                return (
                  <Button
                    key={provider.id}
                    type="button"
                    variant="outline"
                    className="me-provider-connect__button"
                    disabled={
                      isLoadingConnections ||
                      connected ||
                      !method?.enabled ||
                      oauthLoading !== null
                    }
                    title={connected ? '已连接到当前账号' : unavailableReason}
                    onClick={() => void startProviderConnect(provider.id)}
                  >
                    <span
                      className={`me-provider-connect__mark me-provider-connect__mark--${provider.id}`}
                      aria-hidden="true"
                    >
                      {provider.mark}
                    </span>
                    <span>
                      {oauthLoading === provider.id
                        ? '正在跳转…'
                        : connected
                          ? `${provider.label} 已连接`
                          : `连接 ${provider.label}`}
                    </span>
                  </Button>
                )
              })}
            </div>
            {oauthError ? (
              <div className="me-provider-connect__error" role="alert">
                <span>{oauthError}</span>
                {needsStepUp ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSteppingUp}
                    onClick={() => void restartAuthentication()}
                  >
                    {isSteppingUp ? '正在退出…' : '重新登录后关联'}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
          {connectionsError ? (
            <div className="me-inline-error" role="alert">
              <span>{connectionsError}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void loadConnections()}
              >
                <SunIcon name="refresh-cw" />
                重试
              </Button>
            </div>
          ) : null}
        </section>
      </div>

      <section className="me-card me-ai-card">
        <div>
          <span className="me-eyebrow">个人 AI 工作空间</span>
          <h2>角色、Skill 与 MCP</h2>
          <p>
            登录状态下的配置会绑定到当前账号；访客仍可进行临时对话，但不会写入个人工作空间。
          </p>
        </div>
        <Link className="me-link-button" to="/aigc">
          进入配置
          <SunIcon name="chevron-right" />
        </Link>
      </section>

      <footer className="me-page__footer">
        <Button variant="ghost" onClick={() => void logout()}>
          退出当前账号
        </Button>
      </footer>
    </main>
  )
}
export default MePage
