import { SunIcon } from '@sun-world/icons/react'
import { useAuthStore } from '@/store/auth'
export function MePage() {
  const user = useAuthStore((state) => state.user) as {
    name?: string
    avatar?: string
  } | null
  return (
    <main className="me-page">
      <header>
        <img src={user?.avatar || '/avator.webp'} alt="头像" />
        <h1>{user?.name || 'Sun World 用户'}</h1>
      </header>
      <nav aria-label="个人功能">
        {[
          ['upload', '发布'],
          ['star', '收藏'],
          ['draft', '草稿箱'],
          ['settings', '设置'],
        ].map(([icon, label]) => (
          <button key={label}>
            <SunIcon name={icon as 'upload'} />
            {label}
          </button>
        ))}
      </nav>
    </main>
  )
}
export default MePage
