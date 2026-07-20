import { LabeledInput } from '@sun-world/ui/form-controls'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@sun-world/ui/button'
import { toast } from '@sun-world/ui/toast'
import { useAuthStore } from '@/store/auth'
import { getAccountErrorMessage } from '@/modules/account/errors'
import { AuthPageShell } from './AuthPageShell'

export function RegisterPage() {
  const navigate = useNavigate()
  const register = useAuthStore((state) => state.register)
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
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
    if (
      !form.name.trim() ||
      !/^1[3-9]\d{9}$/.test(form.phone) ||
      !/^\S+@\S+\.\S+$/.test(form.email) ||
      form.password.length < 6
    ) {
      setError('请完整填写有效的注册信息')
      return
    }
    if (form.password !== form.confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      await register({
        name: form.name.trim(),
        phone: form.phone,
        email: form.email,
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
      description="创建账号，开始记录、分享和探索。"
      formTitle="注册"
      formDescription="填写基础信息，即可创建新账号。"
    >
      <form className="auth-form" onSubmit={submit}>
        <LabeledInput
          label="昵称"
          value={form.name}
          onValueChange={field('name')}
        />
        <LabeledInput
          label="手机号"
          value={form.phone}
          onValueChange={field('phone')}
        />
        <LabeledInput
          label="邮箱"
          type="email"
          value={form.email}
          onValueChange={field('email')}
        />
        <LabeledInput
          label="密码"
          type="password"
          value={form.password}
          onValueChange={field('password')}
        />
        <LabeledInput
          label="确认密码"
          type="password"
          value={form.confirm}
          onValueChange={field('confirm')}
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
