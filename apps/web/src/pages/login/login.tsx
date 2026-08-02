import { SwInput } from '@sun-world/ui/sw-input'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { SwButton as Button } from '@sun-world/ui/sw-button'
import { toast } from '@sun-world/ui/toast'
import { useAuthStore } from '@/store/auth'
import { getAccountErrorMessage } from '@/modules/account/errors'
import { AuthPageShell } from './AuthPageShell'

export function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (!account.trim() || !password) {
      setError('请输入账号和密码')
      return
    }
    setLoading(true)
    try {
      await login(account.trim(), password)
      toast.success('登录成功')
      navigate('/')
    } catch (reason) {
      setError(getAccountErrorMessage(reason))
    } finally {
      setLoading(false)
    }
  }
  return (
    <AuthPageShell
      eyebrow="Sun World"
      headline="欢迎回来"
      description="登录后，继续探索属于你的世界。"
      formTitle="登录"
      formDescription="使用你的账号继续访问 Sun World。"
    >
      <form className="auth-form" onSubmit={submit}>
        <SwInput
          label="账号"
          value={account}
          onValueChange={setAccount}
          autoComplete="username"
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
      <p className="auth-link">
        还没有账号？ <Link to="/register">注册</Link>
      </p>
    </AuthPageShell>
  )
}
export default LoginPage
