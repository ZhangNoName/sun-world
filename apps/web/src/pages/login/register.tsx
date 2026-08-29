import { SwInput } from '@sun-world/ui/sw-input'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { SwButton as Button } from '@sun-world/ui/sw-button'
import { toast } from '@sun-world/ui/toast'
import { useAuthStore } from '@/store/auth'
import { getAccountErrorMessage } from '@/modules/account/errors'
import { AuthPageShell } from './AuthPageShell'

export function RegisterPage() {
  const navigate = useNavigate()
  const register = useAuthStore((state) => state.register)
  const [form, setForm] = useState({
    name: '',
    password: '',
    confirm: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const field = (name: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [name]: value }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    const username = form.name.trim()
    const phoneLike = /^(?:1[3-9]\d{9}|\+[1-9]\d{7,14})$/.test(
      username.replace(/[\s().-]/g, '')
    )
    if (!username || form.password.length < 8) {
      setError('请完整填写有效的注册信息')
      return
    }
    if (
      username.includes('@') ||
      !/^[A-Za-z0-9_.\-\u4e00-\u9fff]+$/.test(username) ||
      phoneLike
    ) {
      setError('用户名不能是邮箱或手机号，仅支持中英文、数字及 . _ -')
      return
    }
    if (form.password !== form.confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      await register({
        name: username,
        password: form.password,
      })
      toast.success('注册成功')
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
      headline="加入 Sun World"
      description="创建用户名凭据；手机号和邮箱需登录后通过验证码安全关联。"
      formTitle="注册"
      formDescription="联系方式不会在未验证时成为登录凭据。"
    >
      <form className="auth-form" onSubmit={submit}>
        <SwInput
          label="用户名"
          value={form.name}
          onValueChange={field('name')}
          autoComplete="username"
          maxLength={64}
        />
        <SwInput
          label="密码"
          type="password"
          value={form.password}
          onValueChange={field('password')}
          autoComplete="new-password"
          maxLength={128}
        />
        <SwInput
          label="确认密码"
          type="password"
          value={form.confirm}
          onValueChange={field('confirm')}
          autoComplete="new-password"
          maxLength={128}
        />
        {error ? (
          <p role="alert" className="auth-error">
            {error}
          </p>
        ) : null}
        <Button type="submit" size="lg" loading={loading}>
          注册
        </Button>
      </form>
      <p className="auth-link">
        已有账号？ <Link to="/login">登录</Link>
      </p>
    </AuthPageShell>
  )
}
export default RegisterPage
