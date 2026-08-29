import { SwButton as Button } from '@sun-world/ui/sw-button'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { useAuthStore } from '@/store/auth'
import { AuthPageShell } from './AuthPageShell'
import { safeAuthReturnTo } from './returnTo'

const ERROR_MESSAGES: Record<string, string> = {
  AUTH_OAUTH_DENIED: '你取消了第三方授权，账号没有发生任何变化。',
  AUTH_OAUTH_STATE_INVALID: '登录请求已过期或无法验证，请重新发起登录。',
  AUTH_OAUTH_EXCHANGE_FAILED: '第三方账号验证失败，请稍后重试。',
  AUTH_IDENTITY_CONFLICT: '该第三方身份已关联其他账户，请使用原账户登录。',
  AUTH_CONTACT_CONFLICT:
    '第三方返回的已验证联系方式已关联其他账户，未执行关联。',
  AUTH_IDENTITY_DISABLED: '该第三方登录身份已停用，无法自行重新启用。',
  AUTH_OAUTH_CONNECT_SESSION_CHANGED:
    '当前账号与发起关联时不一致，请重新登录后再关联。',
  AUTH_STEP_UP_REQUIRED: '此安全操作需要近期登录，请退出后重新登录再试。',
  AUTH_TOKEN_EXPIRED: '登录状态已过期，请重新登录后再关联。',
  AUTH_UNAUTHORIZED: '请重新登录后再关联第三方账号。',
  AUTH_ACCOUNT_DISABLED: '该账户已停用，暂时无法登录。',
}

const CONNECT_STEP_UP_CODES = new Set([
  'AUTH_OAUTH_CONNECT_SESSION_CHANGED',
  'AUTH_STEP_UP_REQUIRED',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_UNAUTHORIZED',
])

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const restoreSession = useAuthStore((state) => state.restoreSession)
  const logout = useAuthStore((state) => state.logout)
  const returnTo = safeAuthReturnTo(searchParams.get('return_to'))
  const isConnectFlow = searchParams.get('flow') === 'connect'
  const callbackErrorCode = searchParams.get('code') || ''
  const requiresStepUp =
    isConnectFlow && CONNECT_STEP_UP_CODES.has(callbackErrorCode)
  const [message, setMessage] = useState(
    isConnectFlow ? '正在安全完成账号关联…' : '正在安全完成登录…'
  )
  const [failed, setFailed] = useState(false)
  const [isRestarting, setIsRestarting] = useState(false)

  const restartAuthentication = async () => {
    setIsRestarting(true)
    try {
      await logout()
    } catch {
      // The auth store clears local session state even when remote logout fails.
    } finally {
      navigate(`/login?return_to=${encodeURIComponent(returnTo)}`, {
        replace: true,
      })
    }
  }

  useEffect(() => {
    let active = true
    if (window.location.hash.includes('access_token')) {
      setFailed(true)
      setMessage('旧版浏览器令牌回调已停用，请从登录页重新发起授权。')
      return () => {
        active = false
      }
    }
    const status = searchParams.get('status')
    if (status !== 'success') {
      setFailed(true)
      setMessage(
        ERROR_MESSAGES[callbackErrorCode] ||
          (isConnectFlow
            ? '第三方账号关联未完成，当前账号没有发生变化。'
            : '第三方登录未完成，请重新尝试。')
      )
      return () => {
        active = false
      }
    }
    restoreSession()
      .then((user) => {
        if (!active) return
        if (!user) {
          setFailed(true)
          setMessage(
            isConnectFlow
              ? '当前登录会话不可用，请重新登录后再关联。'
              : '本地会话未建立，请重新登录。'
          )
          return
        }
        setMessage(
          isConnectFlow
            ? '账号关联成功，正在返回账户设置…'
            : '登录成功，正在返回…'
        )
        navigate(returnTo, { replace: true })
      })
      .catch(() => {
        if (!active) return
        setFailed(true)
        setMessage(
          isConnectFlow
            ? '当前登录会话校验失败，请重新登录后再关联。'
            : '本地会话恢复失败，请重新登录。'
        )
      })
    return () => {
      active = false
    }
  }, [
    callbackErrorCode,
    isConnectFlow,
    navigate,
    restoreSession,
    returnTo,
    searchParams,
  ])

  return (
    <AuthPageShell
      eyebrow="Secure callback"
      headline={isConnectFlow ? '安全确认新的登录方式' : '账号令牌只留在服务端'}
      description={
        isConnectFlow
          ? '关联目标由服务端一次性状态和当前会话共同确认，第三方令牌不会交给页面脚本。'
          : '第三方 access token 不会出现在浏览器地址或交给页面脚本。'
      }
      formTitle={
        failed
          ? isConnectFlow
            ? '账号关联未完成'
            : '登录未完成'
          : isConnectFlow
            ? '正在关联'
            : '正在登录'
      }
      formDescription={message}
    >
      <div className="auth-callback-status" role={failed ? 'alert' : 'status'}>
        <span className="auth-callback-indicator" aria-hidden="true" />
        <p>{message}</p>
      </div>
      {failed && (!isConnectFlow || requiresStepUp) ? (
        <Button
          type="button"
          size="lg"
          loading={requiresStepUp && isRestarting}
          onClick={() =>
            requiresStepUp
              ? void restartAuthentication()
              : navigate(`/login?return_to=${encodeURIComponent(returnTo)}`, {
                  replace: true,
                })
          }
        >
          {requiresStepUp ? '重新登录后关联' : '返回登录页'}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        onClick={() => navigate(returnTo, { replace: true })}
      >
        {isConnectFlow ? '返回账户设置' : '暂不登录，继续使用'}
      </Button>
    </AuthPageShell>
  )
}

export const QqCallbackPage = AuthCallbackPage
export default AuthCallbackPage
