import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@sun-world/base-ui/tabs'
import { SwButton as Button } from '@sun-world/ui/sw-button'
import { SwInput } from '@sun-world/ui/sw-input'
import { toast } from '@sun-world/ui/toast'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'

import {
  getAuthMethods,
  requestVerificationCode,
  startOAuthLogin,
} from '@/modules/account/api'
import { getAccountErrorMessage } from '@/modules/account/errors'
import type { AuthMethod, VerificationChallenge } from '@/modules/account/types'
import { useAuthStore } from '@/store/auth'
import { AuthPageShell } from './AuthPageShell'
import { safeAuthReturnTo } from './returnTo'

type LoginMode = 'password' | 'phone' | 'email'
type OAuthProvider = 'google' | 'qq' | 'wechat'

const FALLBACK_METHODS: AuthMethod[] = [
  { id: 'password', kind: 'password', label: '账号密码', enabled: true },
  {
    id: 'phone',
    kind: 'verification_code',
    label: '手机号',
    enabled: false,
    reason: '正在检查短信服务',
  },
  {
    id: 'email',
    kind: 'verification_code',
    label: '邮箱',
    enabled: false,
    reason: '正在检查邮件服务',
  },
  {
    id: 'google',
    kind: 'oauth',
    label: 'Google',
    enabled: false,
    reason: '正在检查第三方登录',
  },
  {
    id: 'qq',
    kind: 'oauth',
    label: 'QQ',
    enabled: false,
    reason: '正在检查第三方登录',
  },
  {
    id: 'wechat',
    kind: 'oauth',
    label: '微信',
    enabled: false,
    reason: '正在检查第三方登录',
  },
]

export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const returnTo = safeAuthReturnTo(searchParams.get('return_to'), '/')
  const login = useAuthStore((state) => state.login)
  const loginWithVerification = useAuthStore(
    (state) => state.loginWithVerification
  )
  const [methods, setMethods] = useState<AuthMethod[]>(FALLBACK_METHODS)
  const [mode, setMode] = useState<LoginMode>('password')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [target, setTarget] = useState('')
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOAuthLoading] = useState<OAuthProvider | null>(null)

  useEffect(() => {
    let active = true
    getAuthMethods()
      .then((available) => {
        if (active) {
          setMethods(Array.isArray(available) ? available : FALLBACK_METHODS)
        }
      })
      .catch(() => {
        if (active) setMethods(FALLBACK_METHODS)
      })
    return () => {
      active = false
    }
  }, [])

  const methodById = useMemo(
    () => new Map(methods.map((method) => [method.id, method])),
    [methods]
  )

  const finishLogin = async () => {
    toast.success('登录成功')
    navigate(returnTo)
  }

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    if (!account.trim() || !password) {
      setError('请输入账号和密码')
      return
    }
    setLoading(true)
    try {
      await login(account.trim(), password)
      await finishLogin()
    } catch (reason) {
      setError(getAccountErrorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  const submitVerification = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')
    const channel = mode === 'email' ? 'email' : 'phone'
    const currentMethod = methodById.get(channel)
    if (!currentMethod?.enabled) {
      setError(currentMethod?.reason || '该登录方式暂不可用')
      return
    }
    if (!challenge) {
      if (!target.trim()) {
        setError(channel === 'phone' ? '请输入手机号' : '请输入邮箱')
        return
      }
      setLoading(true)
      try {
        const nextChallenge = await requestVerificationCode({
          channel,
          target: target.trim(),
        })
        setChallenge(nextChallenge)
        setNotice(`验证码已发送至 ${nextChallenge.target_hint}`)
      } catch (reason) {
        setError(getAccountErrorMessage(reason))
      } finally {
        setLoading(false)
      }
      return
    }
    if (!/^\d{6}$/.test(code)) {
      setError('请输入 6 位验证码')
      return
    }
    setLoading(true)
    try {
      await loginWithVerification({
        challenge_id: challenge.challenge_id,
        code,
      })
      await finishLogin()
    } catch (reason) {
      setError(getAccountErrorMessage(reason))
    } finally {
      setLoading(false)
    }
  }

  const startOAuth = async (provider: OAuthProvider) => {
    setError('')
    setNotice('')
    setOAuthLoading(provider)
    try {
      const start = await startOAuthLogin(provider, returnTo)
      window.location.assign(start.authorization_url)
    } catch (reason) {
      setError(getAccountErrorMessage(reason))
      setOAuthLoading(null)
    }
  }

  const selectMode = (value: string) => {
    setMode(value as LoginMode)
    setChallenge(null)
    setCode('')
    setError('')
    setNotice('')
  }

  return (
    <AuthPageShell
      eyebrow="Sun World Account"
      headline="登录是可选的，体验会继续"
      description="无需账号也能浏览与使用 AIGC；登录后可同步对话、角色、Skills 与 MCP 配置。"
      formTitle="欢迎回来"
      formDescription="选择适合你的登录方式，或直接以访客身份继续。"
    >
      <Tabs value={mode} onValueChange={selectMode} className="auth-login-tabs">
        <TabsList className="auth-tabs-list" aria-label="登录方式">
          <TabsTrigger value="password">密码登录</TabsTrigger>
          <TabsTrigger
            value="phone"
            disabled={!methodById.get('phone')?.enabled}
            title={methodById.get('phone')?.reason || undefined}
          >
            手机
          </TabsTrigger>
          <TabsTrigger
            value="email"
            disabled={!methodById.get('email')?.enabled}
            title={methodById.get('email')?.reason || undefined}
          >
            邮箱
          </TabsTrigger>
        </TabsList>

        <TabsContent value="password">
          <form className="auth-form" onSubmit={submitPassword}>
            <SwInput
              label="账号"
              value={account}
              onValueChange={setAccount}
              autoComplete="username"
              placeholder="用户名 / 已验证手机号 / 已验证邮箱"
            />
            <SwInput
              label="密码"
              value={password}
              onValueChange={setPassword}
              type="password"
              autoComplete="current-password"
            />
            {error ? (
              <p role="alert" className="auth-error">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="lg" loading={loading}>
              登录
            </Button>
          </form>
        </TabsContent>

        {(['phone', 'email'] as const).map((channel) => (
          <TabsContent value={channel} key={channel}>
            <form className="auth-form" onSubmit={submitVerification}>
              <SwInput
                label={channel === 'phone' ? '手机号' : '邮箱'}
                type={channel === 'email' ? 'email' : 'tel'}
                inputMode={channel === 'phone' ? 'tel' : 'email'}
                value={target}
                onValueChange={setTarget}
                disabled={Boolean(challenge)}
                autoComplete={channel === 'phone' ? 'tel' : 'email'}
                placeholder={
                  channel === 'phone'
                    ? '支持 +86 或中国大陆手机号'
                    : 'name@example.com'
                }
              />
              {challenge ? (
                <SwInput
                  label="验证码"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onValueChange={setCode}
                  maxLength={6}
                  placeholder="6 位数字"
                />
              ) : null}
              {notice ? (
                <p role="status" className="auth-notice">
                  {notice}
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="auth-error">
                  {error}
                </p>
              ) : null}
              <Button type="submit" size="lg" loading={loading}>
                {challenge ? '验证并登录' : '发送验证码'}
              </Button>
              {challenge ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setChallenge(null)
                    setCode('')
                    setNotice('')
                  }}
                >
                  更换联系方式
                </Button>
              ) : null}
            </form>
          </TabsContent>
        ))}
      </Tabs>

      <div className="auth-divider" role="separator">
        <span>或使用第三方账号</span>
      </div>
      <div className="auth-provider-grid">
        {(['google', 'qq', 'wechat'] as const).map((provider) => {
          const method = methodById.get(provider)
          const brand =
            provider === 'google' ? 'G' : provider === 'qq' ? 'QQ' : '微'
          return (
            <Button
              key={provider}
              type="button"
              variant="outline"
              className="auth-provider-button"
              disabled={!method?.enabled || oauthLoading !== null}
              loading={oauthLoading === provider}
              title={method?.reason || undefined}
              onClick={() => startOAuth(provider)}
            >
              <span
                className={`auth-provider-mark auth-provider-mark--${provider}`}
                aria-hidden="true"
              >
                {brand}
              </span>
              <span>使用 {method?.label || provider} 登录</span>
            </Button>
          )
        })}
      </div>

      <p className="auth-privacy-note">
        只有登录方明确验证过的手机号，才会用于安全关联已有账户；不会按昵称或未验证资料自动合并。
      </p>
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={() => navigate(returnTo === '/' ? '/aigc' : returnTo)}
      >
        暂不登录，继续使用
      </Button>
      <p className="auth-link">
        还没有密码账号？ <Link to="/register">注册</Link>
      </p>
    </AuthPageShell>
  )
}

export default LoginPage
