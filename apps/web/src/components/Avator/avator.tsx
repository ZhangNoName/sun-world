import { useNavigate } from 'react-router'
import { SunButton } from '@sun-world/ui/button'
import { useAuthStore } from '@/store/auth'

export function Avator() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  return (
    <SunButton
      variant="ghost"
      size="sm"
      onClick={() => navigate(user ? '/me' : '/login')}
    >
      {user ? String((user as { name?: string }).name ?? '我的') : '登录'}
    </SunButton>
  )
}

export default Avator
