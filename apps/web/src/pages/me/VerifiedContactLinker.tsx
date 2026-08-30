import { useState, type FormEvent } from 'react'
import { Button } from '@sun-world/base-ui/button'
import { SwInput } from '@sun-world/ui/sw-input'
import { useNavigate } from 'react-router'

import {
  completeConnectionVerification,
  requestConnectionVerificationCode,
} from '@/modules/account/api'
import {
  getAccountErrorMessage,
  isAccountStepUpError,
} from '@/modules/account/errors'
import type {
  AccountConnections,
  VerificationChallenge,
} from '@/modules/account/types'
import { safeAuthReturnTo } from '@/pages/login/returnTo'
import { useAuthStore } from '@/store/auth'

const connectionReturnTo = safeAuthReturnTo('/me?panel=connections', '/me')
const stepUpPath = `/login?return_to=${encodeURIComponent(connectionReturnTo)}`

interface VerifiedContactLinkerProps {
  onLinked: (connections: AccountConnections) => void
}

export function VerifiedContactLinker({
  onLinked,
}: VerifiedContactLinkerProps) {
  const navigate = useNavigate()
  const logout = useAuthStore((state) => state.logout)
  const [channel, setChannel] = useState<'phone' | 'email'>('phone')
  const [target, setTarget] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState<VerificationChallenge | null>(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [needsStepUp, setNeedsStepUp] = useState(false)
  const [isSteppingUp, setIsSteppingUp] = useState(false)

  const requestCode = async (event: FormEvent) => {
    event.preventDefault()
    if (!target.trim()) return
    setIsSubmitting(true)
    setMessage('')
    setError('')
    setNeedsStepUp(false)
    try {
      const nextChallenge = await requestConnectionVerificationCode({
        channel,
        target: target.trim(),
      })
      setChallenge(nextChallenge)
      setMessage(`验证码已发送至 ${nextChallenge.target_hint}`)
    } catch (requestError) {
      setNeedsStepUp(isAccountStepUpError(requestError))
      setError(getAccountErrorMessage(requestError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const completeLink = async (event: FormEvent) => {
    event.preventDefault()
    if (!challenge || !/^\d{6}$/.test(code)) return
    setIsSubmitting(true)
    setError('')
    setNeedsStepUp(false)
    try {
      const connections = await completeConnectionVerification({
        challenge_id: challenge.challenge_id,
        code,
      })
      onLinked(connections)
      setChallenge(null)
      setTarget('')
      setCode('')
      setMessage('联系方式已验证并关联到当前账号。')
    } catch (completeError) {
      setNeedsStepUp(isAccountStepUpError(completeError))
      setError(getAccountErrorMessage(completeError))
    } finally {
      setIsSubmitting(false)
    }
  }

  const restartAuthentication = async () => {
    setIsSteppingUp(true)
    try {
      await logout()
    } catch {
      // The auth store clears local session state even when remote logout fails.
    } finally {
      navigate(stepUpPath)
    }
  }

  return (
    <details className="me-contact-linker">
      <summary>添加已验证方式</summary>
      {!challenge ? (
        <form onSubmit={requestCode}>
          <div
            className="me-contact-linker__channels"
            role="group"
            aria-label="验证方式"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={channel === 'phone'}
              onClick={() => setChannel('phone')}
            >
              手机号
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={channel === 'email'}
              onClick={() => setChannel('email')}
            >
              邮箱
            </Button>
          </div>
          <div className="me-contact-linker__row">
            <SwInput
              id="verified-contact-target"
              label={channel === 'phone' ? '手机号' : '邮箱'}
              type={channel === 'phone' ? 'tel' : 'email'}
              autoComplete={channel === 'phone' ? 'tel' : 'email'}
              value={target}
              onValueChange={setTarget}
              placeholder={
                channel === 'phone' ? '+86 13800138000' : 'you@example.com'
              }
              required
            />
            <Button type="submit" disabled={isSubmitting || !target.trim()}>
              {isSubmitting ? '发送中…' : '发送验证码'}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={completeLink}>
          <div className="me-contact-linker__row">
            <SwInput
              id="verified-contact-code"
              label="6 位验证码"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              value={code}
              onValueChange={(value) => setCode(value.replace(/\D/g, ''))}
              required
            />
            <Button type="submit" disabled={isSubmitting || code.length !== 6}>
              {isSubmitting ? '验证中…' : '完成关联'}
            </Button>
          </div>
          <Button
            className="me-contact-linker__reset"
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setChallenge(null)
              setCode('')
              setMessage('')
              setError('')
              setNeedsStepUp(false)
            }}
          >
            更换联系方式
          </Button>
        </form>
      )}
      {message ? (
        <p className="me-contact-linker__message" aria-live="polite">
          {message}
        </p>
      ) : null}
      {error ? (
        <div className="me-contact-linker__error" role="alert">
          <span>{error}</span>
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
    </details>
  )
}
