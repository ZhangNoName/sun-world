import { useNavigate } from 'react-router'
import { Button } from '@sun-world/base-ui/button'
import { useAuthStore } from '@/store/auth'

export function Avator() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  return (
    <Button size="sm" onClick={() => navigate(user ? '/me' : '/login')}>
      {user ? String((user as { name?: string }).name ?? '我的') : '登录'}
    </Button>
  )
}

export default Avator
